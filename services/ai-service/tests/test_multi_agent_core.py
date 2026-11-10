"""Tests for bounded multi-agent contracts and coordination."""

import asyncio
import json
import uuid

import pytest
from pydantic import ValidationError

from app.multi_agent.contracts import (
    AgentRole,
    PlanStep,
    StepStatus,
    TaskPlan,
    TaskRequest,
    TaskStatus,
    ReviewResult,
    SpecialistOutput,
)
from app.multi_agent.coordinator import MultiAgentCoordinator


def test_specialist_output_accepts_valid_content_and_metadata():
    result = SpecialistOutput(
        content="Evidence-based analysis",
        caveats=["One source is incomplete"],
        evidence_refs=["document:123"],
    )

    assert result.content == "Evidence-based analysis"
    assert result.caveats == ["One source is incomplete"]
    assert result.evidence_refs == ["document:123"]


@pytest.mark.parametrize(
    "payload",
    [
        {"content": ""},
        {"content": "Valid", "caveats": [" "]},
        {"content": "Valid", "caveats": ["x" * 501]},
        {"content": "Valid", "evidence_refs": [" "]},
        {"content": "Valid", "evidence_refs": ["x" * 201]},
        {"content": "Valid", "caveats": ["caveat"] * 13},
        {"content": "Valid", "evidence_refs": ["ref"] * 21},
    ],
)
def test_specialist_output_rejects_invalid_content_or_metadata(payload):
    with pytest.raises(ValidationError):
        SpecialistOutput(**payload)


def test_plan_accepts_all_executable_specialist_roles():
    from app.multi_agent.contracts import AgentRole

    roles = (
        AgentRole.RESEARCHER,
        AgentRole.EXECUTOR,
        AgentRole.MEMORY,
        AgentRole.WRITER,
        AgentRole.ANALYST,
    )
    plan = TaskPlan(
        steps=[
            PlanStep(
                id=f"step_{role.value}",
                role=role,
                objective=f"Perform {role.value} work",
                expected_output="A validated result",
            )
            for role in roles
        ]
    )

    assert [step.role for step in plan.steps] == list(roles)


@pytest.mark.parametrize("role", ["planner", "reviewer", "coordinator"])
def test_plan_rejects_orchestration_only_roles(role):
    with pytest.raises(ValidationError, match="cannot be used"):
        TaskPlan(
            steps=[
                PlanStep(
                    id="invalid",
                    role=role,
                    objective="Attempt orchestration as a worker",
                    expected_output="A result",
                )
            ]
        )


def test_plan_rejects_duplicate_step_ids():
    with pytest.raises(ValidationError, match="unique"):
        TaskPlan(steps=[
            PlanStep(id="first", objective="A", expected_output="A"),
            PlanStep(id="first", objective="B", expected_output="B"),
        ])


def test_plan_rejects_unknown_dependency():
    with pytest.raises(ValidationError, match="unknown dependency"):
        TaskPlan(steps=[
            PlanStep(
                id="first",
                depends_on=["missing"],
                objective="A",
                expected_output="A",
            ),
        ])


def test_plan_rejects_dependency_cycle():
    with pytest.raises(ValidationError, match="acyclic"):
        TaskPlan(steps=[
            PlanStep(
                id="first",
                depends_on=["second"],
                objective="A",
                expected_output="A",
            ),
            PlanStep(
                id="second",
                depends_on=["first"],
                objective="B",
                expected_output="B",
            ),
        ])


def test_request_bounds_prompt_and_step_count():
    with pytest.raises(ValidationError):
        TaskRequest(prompt="x", max_steps=13)

    with pytest.raises(ValidationError):
        TaskRequest(prompt="x" * 4_001)


def test_coordinator_executes_dependencies_and_reviews_output():
    calls = []

    async def planner(request):
        return TaskPlan(steps=[
            PlanStep(id="first", objective="Gather facts", expected_output="facts"),
            PlanStep(
                id="second",
                depends_on=["first"],
                objective="Summarize facts",
                expected_output="summary",
            ),
        ])

    async def executor(step, prior_outputs):
        calls.append(step.id)
        if step.id == "second":
            assert prior_outputs["first"] == "facts found"
        return "facts found" if step.id == "first" else "summary written"

    async def reviewer(request, outputs):
        assert outputs["second"] == "summary written"
        return ReviewResult(approved=True, final_answer="The reviewed answer", feedback="Looks good")

    coordinator = MultiAgentCoordinator(planner, executor, reviewer)
    result = asyncio.run(coordinator.run(TaskRequest(prompt="Summarize this")))

    assert result.status == TaskStatus.COMPLETED
    assert [step.status for step in result.steps] == [
        StepStatus.COMPLETED,
        StepStatus.COMPLETED,
    ]
    assert result.final_output == "The reviewed answer"
    assert calls == ["first", "second"]


def test_coordinator_dispatches_by_role_and_preserves_fallback():
    calls = []

    async def planner(request):
        return TaskPlan(steps=[
            PlanStep(
                id="research",
                role=AgentRole.RESEARCHER,
                objective="Research the supplied evidence",
                expected_output="Research findings",
            ),
            PlanStep(
                id="execute",
                role=AgentRole.EXECUTOR,
                objective="Perform the requested task",
                expected_output="Execution result",
            ),
        ])

    async def fallback_executor(step, dependency_outputs):
        calls.append(("fallback", step.role))
        return "fallback result"

    async def researcher_executor(step, dependency_outputs):
        calls.append(("researcher", step.role))
        return "research result"

    async def reviewer(request, outputs):
        return ReviewResult(approved=True, final_answer="Reviewed answer")

    coordinator = MultiAgentCoordinator(
        planner,
        fallback_executor,
        reviewer,
        role_executors={AgentRole.RESEARCHER: researcher_executor},
    )
    result = asyncio.run(coordinator.run(TaskRequest(prompt="Test role dispatch")))

    assert result.status == TaskStatus.COMPLETED
    assert len(calls) == 2
    assert set(calls) == {
        ("researcher", AgentRole.RESEARCHER),
        ("fallback", AgentRole.EXECUTOR),
    }


def test_failed_step_skips_dependent_step():
    async def planner(request):
        return TaskPlan(steps=[
            PlanStep(id="first", objective="Do work", expected_output="output"),
            PlanStep(
                id="second",
                depends_on=["first"],
                objective="Continue work",
                expected_output="output",
            ),
        ])

    async def executor(step, prior_outputs):
        if step.id == "first":
            raise RuntimeError("sensitive provider detail")
        return "should not run"

    async def reviewer(request, outputs):
        return ReviewResult(approved=True, final_answer="The reviewed answer", feedback="Looks good")

    result = asyncio.run(
        MultiAgentCoordinator(planner, executor, reviewer).run(
            TaskRequest(prompt="Do work")
        )
    )

    assert result.status == TaskStatus.FAILED
    assert result.steps[0].status == StepStatus.FAILED
    assert result.steps[1].status == StepStatus.SKIPPED
    assert result.steps[0].error_code == "execution_failed"


def test_planner_cannot_exceed_requested_step_limit():
    async def planner(request):
        return TaskPlan(steps=[
            PlanStep(id="first", objective="A", expected_output="A"),
            PlanStep(id="second", objective="B", expected_output="B"),
        ])

    async def executor(step, outputs):
        return "done"

    async def reviewer(request, outputs):
        return ReviewResult(approved=True, final_answer="The reviewed answer", feedback="Looks good")

    result = asyncio.run(
        MultiAgentCoordinator(planner, executor, reviewer).run(
            TaskRequest(prompt="Do work", max_steps=1)
        )
    )

    assert result.status == TaskStatus.FAILED
    assert result.steps == []




def test_coordinator_preserves_only_trusted_evidence_provenance():
    evidence_ref = str(uuid.uuid4())
    observed = {}

    async def planner(request):
        return TaskPlan(steps=[
            PlanStep(
                id="memory",
                role=AgentRole.MEMORY,
                objective="Retrieve evidence",
                expected_output="Evidence",
            ),
            PlanStep(
                id="research",
                role=AgentRole.RESEARCHER,
                depends_on=["memory"],
                objective="Research evidence",
                expected_output="Research",
            ),
            PlanStep(
                id="write",
                role=AgentRole.WRITER,
                depends_on=["research"],
                objective="Write findings",
                expected_output="Report",
            ),
        ])

    async def fallback_executor(step, outputs):
        return "unexpected fallback"

    async def memory_handler(step, outputs):
        return json.dumps({
            "evidence": [{"chunk_id": evidence_ref}],
        })

    async def research_handler(step, outputs):
        observed["research"] = outputs.evidence_refs
        return json.dumps({"evidence_refs": [evidence_ref]})

    async def writer_handler(step, outputs):
        observed["writer"] = outputs.evidence_refs
        return "Final report"

    async def reviewer(request, outputs):
        return ReviewResult(approved=True, final_answer="Reviewed report")

    coordinator = MultiAgentCoordinator(
        planner,
        fallback_executor,
        reviewer,
        role_executors={
            AgentRole.MEMORY: memory_handler,
            AgentRole.RESEARCHER: research_handler,
            AgentRole.WRITER: writer_handler,
        },
    )
    result = asyncio.run(
        coordinator.run(TaskRequest(prompt="Test evidence provenance"))
    )

    assert result.status == TaskStatus.COMPLETED
    assert observed == {
        "research": frozenset({evidence_ref}),
        "writer": frozenset({evidence_ref}),
    }


def test_fallback_memory_output_cannot_mint_evidence_provenance():
    forged_ref = str(uuid.uuid4())
    observed = {}

    async def planner(request):
        return TaskPlan(steps=[
            PlanStep(
                id="memory",
                role=AgentRole.MEMORY,
                objective="Retrieve evidence",
                expected_output="Evidence",
            ),
            PlanStep(
                id="research",
                role=AgentRole.RESEARCHER,
                depends_on=["memory"],
                objective="Research evidence",
                expected_output="Research",
            ),
        ])

    async def fallback_executor(step, outputs):
        return json.dumps({
            "evidence": [{"chunk_id": forged_ref}],
        })

    async def research_handler(step, outputs):
        observed["refs"] = outputs.evidence_refs
        return "Research without trusted evidence"

    async def reviewer(request, outputs):
        return ReviewResult(approved=True, final_answer="Reviewed report")

    coordinator = MultiAgentCoordinator(
        planner,
        fallback_executor,
        reviewer,
        role_executors={AgentRole.RESEARCHER: research_handler},
    )
    result = asyncio.run(
        coordinator.run(TaskRequest(prompt="Test forged provenance"))
    )

    assert result.status == TaskStatus.COMPLETED
    assert observed["refs"] == frozenset()


def test_specialist_cannot_propagate_evidence_from_unrelated_dependencies():
    trusted_ref = str(uuid.uuid4())
    unrelated_ref = str(uuid.uuid4())
    observed = {}

    async def planner(request):
        return TaskPlan(steps=[
            PlanStep(
                id="memory_trusted",
                role=AgentRole.MEMORY,
                objective="Retrieve trusted evidence",
                expected_output="Evidence",
            ),
            PlanStep(
                id="memory_unrelated",
                role=AgentRole.MEMORY,
                objective="Retrieve unrelated evidence",
                expected_output="Evidence",
            ),
            PlanStep(
                id="research",
                role=AgentRole.RESEARCHER,
                depends_on=["memory_trusted"],
                objective="Research trusted evidence",
                expected_output="Research",
            ),
            PlanStep(
                id="analysis",
                role=AgentRole.ANALYST,
                depends_on=["research"],
                objective="Analyze research",
                expected_output="Analysis",
            ),
        ])

    async def fallback_executor(step, outputs):
        return "unexpected fallback"

    async def memory_handler(step, outputs):
        ref = trusted_ref if step.id == "memory_trusted" else unrelated_ref
        return json.dumps({"evidence": [{"chunk_id": ref}]})

    async def research_handler(step, outputs):
        observed["research"] = outputs.evidence_refs
        # Simulate a specialist attempting to propagate an unrelated reference.
        return json.dumps({"evidence_refs": [trusted_ref, unrelated_ref]})

    async def analyst_handler(step, outputs):
        observed["analysis"] = outputs.evidence_refs
        return "Analysis complete"

    async def reviewer(request, outputs):
        return ReviewResult(approved=True, final_answer="Reviewed report")

    coordinator = MultiAgentCoordinator(
        planner,
        fallback_executor,
        reviewer,
        role_executors={
            AgentRole.MEMORY: memory_handler,
            AgentRole.RESEARCHER: research_handler,
            AgentRole.ANALYST: analyst_handler,
        },
    )
    result = asyncio.run(
        coordinator.run(TaskRequest(prompt="Test evidence isolation"))
    )

    assert result.status == TaskStatus.COMPLETED
    assert observed == {
        "research": frozenset({trusted_ref}),
        "analysis": frozenset({trusted_ref}),
    }


def test_executor_receives_only_declared_dependency_outputs():
    async def planner(request):
        return TaskPlan(steps=[
            PlanStep(id="first", objective="A", expected_output="A"),
            PlanStep(id="second", objective="B", expected_output="B"),
            PlanStep(
                id="third",
                depends_on=["first"],
                objective="Use first output only",
                expected_output="C",
            ),
        ])

    async def executor(step, outputs):
        if step.id == "third":
            assert outputs == {"first": "output-first"}
        return f"output-{step.id}"

    async def reviewer(request, outputs):
        return ReviewResult(approved=True, final_answer="The reviewed answer", feedback="Looks good")

    result = asyncio.run(
        MultiAgentCoordinator(planner, executor, reviewer).run(
            TaskRequest(prompt="Check context isolation")
        )
    )
    assert result.status == TaskStatus.COMPLETED


def test_reviewer_rejection_fails_task():
    async def planner(request):
        return TaskPlan(steps=[
            PlanStep(id="first", objective="A", expected_output="A"),
        ])

    async def executor(step, outputs):
        return "done"

    async def reviewer(request, outputs):
        return ReviewResult(approved=False, feedback="Needs correction")

    result = asyncio.run(
        MultiAgentCoordinator(planner, executor, reviewer).run(
            TaskRequest(prompt="Review this")
        )
    )
    assert result.status == TaskStatus.FAILED
    assert result.final_output is None


def test_reviewer_exception_fails_task_without_leaking_details():
    async def planner(request):
        return TaskPlan(steps=[
            PlanStep(id="first", objective="A", expected_output="A"),
        ])

    async def executor(step, outputs):
        return "done"

    async def reviewer(request, outputs):
        raise RuntimeError("secret provider detail")

    result = asyncio.run(
        MultiAgentCoordinator(planner, executor, reviewer).run(
            TaskRequest(prompt="Review this")
        )
    )
    assert result.status == TaskStatus.FAILED
    assert result.final_output is None
    assert "secret provider detail" not in repr(result.model_dump())


def test_coordinator_returns_final_answer_not_reviewer_feedback():
    async def planner(request):
        return TaskPlan(steps=[
            PlanStep(
                id="answer",
                objective="Draft an answer",
                expected_output="A concise answer",
            )
        ])

    async def executor(step, outputs):
        return "Draft answer"

    async def reviewer(request, outputs):
        return ReviewResult(
            approved=True,
            final_answer="The actual approved answer",
            feedback="Minor issue noted, but approved",
        )

    result = asyncio.run(
        MultiAgentCoordinator(planner, executor, reviewer).run(
            TaskRequest(prompt="Answer this")
        )
    )

    assert result.status == TaskStatus.COMPLETED
    assert result.final_output == "The actual approved answer"
    assert result.final_output != "Minor issue noted, but approved"


def test_coordinator_normalizes_escaped_newlines_in_final_answer():
    async def planner(request):
        return TaskPlan(steps=[
            PlanStep(
                id="answer",
                objective="Draft an answer",
                expected_output="A concise answer",
            )
        ])

    async def executor(step, outputs):
        return "Draft answer"

    async def reviewer(request, outputs):
        return ReviewResult(
            approved=True,
            final_answer="An API is an interface.\\n- It connects software.\\n- It defines rules.",
        )

    result = asyncio.run(
        MultiAgentCoordinator(planner, executor, reviewer).run(
            TaskRequest(prompt="Explain APIs")
        )
    )

    assert result.status == TaskStatus.COMPLETED
    assert result.final_output == (
        "An API is an interface.\n"
        "- It connects software.\n"
        "- It defines rules."
    )


def test_coordinator_rejects_invalid_planner_result():
    async def planner(request):
        return {"steps": "not-a-valid-step-list"}

    async def executor(step, outputs):
        raise AssertionError("Executor must not run for an invalid plan")

    async def reviewer(request, outputs):
        raise AssertionError("Reviewer must not run for an invalid plan")

    result = asyncio.run(
        MultiAgentCoordinator(planner, executor, reviewer).run(
            TaskRequest(prompt="Validate the plan")
        )
    )

    assert result.status == TaskStatus.FAILED
    assert result.steps == []
    assert result.final_output is None


def test_coordinator_bounds_concurrent_execution():
    async def scenario():
        active = 0
        peak_active = 0

        async def planner(request):
            return TaskPlan(
                steps=[
                    PlanStep(
                        id=f"step{i}",
                        objective=f"Execute step {i}",
                        expected_output="A result",
                    )
                    for i in range(6)
                ]
            )

        async def executor(step, outputs):
            nonlocal active, peak_active
            active += 1
            peak_active = max(peak_active, active)
            try:
                await asyncio.sleep(0.01)
                return f"Result for {step.id}"
            finally:
                active -= 1

        async def reviewer(request, outputs):
            return ReviewResult(
                approved=True,
                final_answer="All steps reviewed",
                feedback="Passed",
            )

        result = await MultiAgentCoordinator(
            planner,
            executor,
            reviewer,
            max_concurrency=2,
        ).run(TaskRequest(prompt="Run independent steps"))

        assert result.status == TaskStatus.COMPLETED
        assert peak_active == 2
        assert active == 0

    asyncio.run(scenario())


def test_coordinator_propagates_external_cancellation():
    async def scenario():
        started = asyncio.Event()
        cancelled = asyncio.Event()

        async def planner(request):
            return TaskPlan(
                steps=[
                    PlanStep(
                        id="work",
                        objective="Run work",
                        expected_output="A result",
                    )
                ]
            )

        async def executor(step, outputs):
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()

        async def reviewer(request, outputs):
            raise AssertionError("Reviewer must not run after cancellation")

        task = asyncio.create_task(
            MultiAgentCoordinator(planner, executor, reviewer).run(
                TaskRequest(prompt="Test cancellation")
            )
        )

        await asyncio.wait_for(started.wait(), timeout=1)
        task.cancel()

        with pytest.raises(asyncio.CancelledError):
            await task

        assert cancelled.is_set()

    asyncio.run(scenario())


def test_coordinator_timeout_fails_without_leaking_provider_details():
    async def planner(request):
        return TaskPlan(
            steps=[
                PlanStep(
                    id="slow",
                    objective="Run slow work",
                    expected_output="A result",
                )
            ]
        )

    async def executor(step, outputs):
        await asyncio.Event().wait()

    async def reviewer(request, outputs):
        raise AssertionError("Reviewer must not run after timeout")

    result = asyncio.run(
        MultiAgentCoordinator(planner, executor, reviewer).run(
            TaskRequest(prompt="Test timeout", timeout_seconds=0.05)
        )
    )

    assert result.status == TaskStatus.FAILED
    assert result.final_output is None
    assert "provider" not in repr(result.model_dump()).lower()


def test_coordinator_timeout_preserves_completed_step_results():
    async def scenario():
        slow_step_started = asyncio.Event()

        async def planner(request):
            return TaskPlan(
                steps=[
                    PlanStep(
                        id="fast",
                        objective="Finish quickly",
                        expected_output="A result",
                    ),
                    PlanStep(
                        id="slow",
                        objective="Wait past deadline",
                        expected_output="A result",
                    ),
                ]
            )

        async def executor(step, outputs):
            if step.id == "fast":
                return "completed result"

            slow_step_started.set()
            await asyncio.Event().wait()

        async def reviewer(request, outputs):
            raise AssertionError("Reviewer must not run after timeout")

        result = await MultiAgentCoordinator(
            planner,
            executor,
            reviewer,
            max_concurrency=2,
        ).run(
            TaskRequest(
                prompt="Preserve partial progress",
                timeout_seconds=0.1,
            )
        )

        assert slow_step_started.is_set()
        assert result.status == TaskStatus.FAILED
        assert result.final_output is None
        assert len(result.steps) == 2

        by_id = {step.step_id: step for step in result.steps}
        assert by_id["fast"].status == StepStatus.COMPLETED
        assert by_id["fast"].output == "completed result"
        assert by_id["slow"].status != StepStatus.COMPLETED

    asyncio.run(scenario())


def test_coordinator_emits_bounded_progress_without_outputs():
    async def scenario():
        events = []

        async def planner(request):
            return TaskPlan(steps=[
                PlanStep(
                    id="first",
                    objective="Do work",
                    expected_output="A result",
                ),
                PlanStep(
                    id="second",
                    depends_on=["first"],
                    objective="Finish work",
                    expected_output="A result",
                ),
            ])

        async def executor(step, outputs):
            return "private execution output"

        async def reviewer(request, outputs):
            return ReviewResult(
                approved=True,
                final_answer="private final output",
            )

        async def on_progress(snapshot):
            events.append(snapshot)

        result = await MultiAgentCoordinator(
            planner, executor, reviewer
        ).run(
            TaskRequest(prompt="private prompt"),
            on_progress=on_progress,
        )

        assert result.status == TaskStatus.COMPLETED
        assert events[0]["phase"] == "planning"
        assert events[-1]["phase"] == "completed"
        assert any(
            step["status"] == "running"
            for event in events
            for step in event["steps"]
        )
        assert all(
            set(event) == {"phase", "steps"}
            and all(
                set(step) == {"step_id", "role", "status"}
                for step in event["steps"]
            )
            for event in events
        )
        assert "private prompt" not in repr(events)
        assert "private execution output" not in repr(events)
        assert "private final output" not in repr(events)

    asyncio.run(scenario())


def test_coordinator_progress_callback_failure_does_not_fail_task():
    async def scenario():
        async def planner(request):
            return TaskPlan(steps=[
                PlanStep(
                    id="first",
                    objective="Do work",
                    expected_output="A result",
                )
            ])

        async def executor(step, outputs):
            return "done"

        async def reviewer(request, outputs):
            return ReviewResult(approved=True, final_answer="done")

        async def broken_callback(snapshot):
            raise RuntimeError("delivery failure")

        result = await MultiAgentCoordinator(
            planner, executor, reviewer
        ).run(
            TaskRequest(prompt="test"),
            on_progress=broken_callback,
        )

        assert result.status == TaskStatus.COMPLETED

    asyncio.run(scenario())


def test_coordinator_emits_failed_progress_when_planning_raises():
    async def scenario():
        events = []

        async def planner(request):
            raise RuntimeError("private provider details")

        async def executor(step, outputs):
            raise AssertionError("executor should not run")

        async def reviewer(request, outputs):
            raise AssertionError("reviewer should not run")

        async def on_progress(snapshot):
            events.append(snapshot)

        result = await MultiAgentCoordinator(
            planner, executor, reviewer
        ).run(
            TaskRequest(prompt="test"),
            on_progress=on_progress,
        )

        assert result.status == TaskStatus.FAILED
        assert events[-1] == {"phase": "failed", "steps": []}
        assert "private provider details" not in repr(events)

    asyncio.run(scenario())


def test_coordinator_emits_failed_progress_when_planning_times_out():
    async def scenario():
        events = []

        async def planner(request):
            await asyncio.sleep(1)
            raise AssertionError("planner should time out")

        async def executor(step, outputs):
            raise AssertionError("executor should not run")

        async def reviewer(request, outputs):
            raise AssertionError("reviewer should not run")

        async def on_progress(snapshot):
            events.append(snapshot)

        result = await MultiAgentCoordinator(
            planner, executor, reviewer
        ).run(
            TaskRequest(prompt="test", timeout_seconds=0.01),
            on_progress=on_progress,
        )

        assert result.status == TaskStatus.FAILED
        assert events[-1] == {"phase": "failed", "steps": []}

    asyncio.run(scenario())
