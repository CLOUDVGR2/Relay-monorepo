"""Tests for provider-independent multi-agent role agents."""

import json
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from app.multi_agent.agents import (
    DependencyOutputs,
    AnalystAgent,
    ExecutorAgent,
    ResearcherAgent,
    MemoryAgent,
    PlannerAgent,
    ReviewerAgent,
    WriterAgent,
)
from app.multi_agent.contracts import (
    PlanStep,
    ReviewResult,
    TaskPlan,
    TaskRequest,
)


@pytest.mark.asyncio
async def test_planner_validates_provider_output():
    class Provider:
        async def plan(self, request):
            return {
                "steps": [
                    {
                        "id": "research",
                        "role": "executor",
                        "depends_on": [],
                        "objective": "Gather relevant facts",
                        "expected_output": "A factual summary",
                    }
                ]
            }

    plan = await PlannerAgent(Provider()).plan(
        TaskRequest(prompt="Research a topic")
    )

    assert isinstance(plan, TaskPlan)
    assert plan.steps[0].id == "research"


@pytest.mark.asyncio
async def test_planner_rejects_invalid_provider_output():
    class Provider:
        async def plan(self, request):
            return {"unexpected": "field"}

    with pytest.raises(ValidationError):
        await PlannerAgent(Provider()).plan(TaskRequest(prompt="Research"))


@pytest.mark.asyncio
async def test_planner_enforces_request_step_limit():
    class Provider:
        async def plan(self, request):
            return TaskPlan(
                steps=[
                    PlanStep(
                        id="first",
                        objective="First step",
                        expected_output="First output",
                    ),
                    PlanStep(
                        id="second",
                        objective="Second step",
                        expected_output="Second output",
                    ),
                ]
            )

    with pytest.raises(ValueError, match="step limit"):
        await PlannerAgent(Provider()).plan(
            TaskRequest(prompt="Research", max_steps=1)
        )


@pytest.mark.asyncio
async def test_executor_passes_a_copy_of_dependency_outputs():
    received = {}

    class Provider:
        async def execute(self, step, dependency_outputs):
            received.update(dependency_outputs)
            dependency_outputs["injected"] = "local mutation"
            return "  completed output  "

    dependencies = {"research": "trusted prior result"}
    result = await ExecutorAgent(Provider()).execute(
        PlanStep(
            id="summarize",
            depends_on=["research"],
            objective="Summarize research",
            expected_output="Summary",
        ),
        dependencies,
    )

    assert result == "completed output"
    assert received["research"] == "trusted prior result"
    assert "injected" not in dependencies


@pytest.mark.asyncio
@pytest.mark.parametrize("output", ["", "   ", None, 123])
async def test_executor_rejects_empty_or_invalid_output(output):
    class Provider:
        async def execute(self, step, dependency_outputs):
            return output

    with pytest.raises(ValueError, match="empty output"):
        await ExecutorAgent(Provider()).execute(
            PlanStep(
                id="work",
                objective="Do work",
                expected_output="Output",
            ),
            {},
        )


@pytest.mark.asyncio
async def test_executor_rejects_oversized_output():
    class Provider:
        async def execute(self, step, dependency_outputs):
            return "x" * 8_001

    with pytest.raises(ValueError, match="size limit"):
        await ExecutorAgent(Provider()).execute(
            PlanStep(
                id="work",
                objective="Do work",
                expected_output="Output",
            ),
            {},
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "agent_class"),
    [
        ("research", ResearcherAgent),
        ("analyze", AnalystAgent),
        ("write", WriterAgent),
    ],
)
async def test_specialist_agents_validate_output_and_copy_dependencies(
    method, agent_class
):
    evidence_ref = str(uuid.uuid4())

    async def operation(step, dependency_outputs):
        dependency_outputs["injected"] = "provider mutation"
        return {
            "content": f"Completed {method}",
            "caveats": ["Limited to supplied evidence"],
            "evidence_refs": [evidence_ref],
        }

    provider = SimpleNamespace(**{method: AsyncMock(side_effect=operation)})
    agent = agent_class(provider)
    dependencies = DependencyOutputs(
        {
            "memory": json.dumps({
                "evidence": [{"chunk_id": evidence_ref}],
            })
        },
        evidence_refs={evidence_ref},
    )

    result = await getattr(agent, method)(
        PlanStep(
            id="specialist",
            objective=f"Perform {method}",
            expected_output="Structured result",
        ),
        dependencies,
    )

    decoded = json.loads(result)
    assert decoded["content"] == f"Completed {method}"
    assert decoded["caveats"] == ["Limited to supplied evidence"]
    assert decoded["evidence_refs"] == [evidence_ref]
    assert "injected" not in dependencies


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "agent_class"),
    [
        ("research", ResearcherAgent),
        ("analyze", AnalystAgent),
        ("write", WriterAgent),
    ],
)
async def test_specialist_agents_reject_unsupported_evidence_refs(
    method, agent_class
):
    provider = SimpleNamespace(
        **{
            method: AsyncMock(return_value={
                "content": "Unsupported claim",
                "evidence_refs": [str(uuid.uuid4())],
            })
        }
    )
    agent = agent_class(provider)

    with pytest.raises(ValueError, match="unsupported evidence references"):
        await getattr(agent, method)(
            PlanStep(
                id="specialist",
                objective="Perform specialist work",
                expected_output="Structured result",
            ),
            {"memory": json.dumps({"evidence": []})},
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "agent_class"),
    [
        ("research", ResearcherAgent),
        ("analyze", AnalystAgent),
        ("write", WriterAgent),
    ],
)
@pytest.mark.parametrize(
    "dependency_payload",
    [
        lambda ref: {"evidence": [{"chunk_id": "not-a-uuid"}]},
        lambda ref: {"evidence": [], "evidence_refs": [ref]},
    ],
)
async def test_specialist_agents_reject_untrusted_dependency_references(
    method, agent_class, dependency_payload
):
    evidence_ref = str(uuid.uuid4())
    provider = SimpleNamespace(
        **{
            method: AsyncMock(return_value={
                "content": "Unsupported provenance",
                "evidence_refs": [evidence_ref],
            })
        }
    )
    agent = agent_class(provider)

    with pytest.raises(ValueError, match="unsupported evidence references"):
        await getattr(agent, method)(
            PlanStep(
                id="specialist",
                objective="Perform specialist work",
                expected_output="Structured result",
            ),
            {"upstream": json.dumps(dependency_payload(evidence_ref))},
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "agent_class"),
    [
        ("research", ResearcherAgent),
        ("analyze", AnalystAgent),
        ("write", WriterAgent),
    ],
)
async def test_specialist_agents_reject_invalid_provider_output(
    method, agent_class
):
    provider = SimpleNamespace(
        **{method: AsyncMock(return_value={"unexpected": "field"})}
    )
    agent = agent_class(provider)

    with pytest.raises(ValidationError):
        await getattr(agent, method)(
            PlanStep(
                id="specialist",
                objective="Perform specialist work",
                expected_output="Structured result",
            ),
            {},
        )


@pytest.mark.asyncio
async def test_memory_agent_forwards_explicit_tenant_scope(monkeypatch):
    import app.multi_agent.agents as agents_module

    tenant_id = uuid.uuid4()
    db = object()
    expected = [object()]
    retrieve_mock = AsyncMock(return_value=expected)
    monkeypatch.setattr(agents_module, "retrieve_chunks", retrieve_mock)

    result = await MemoryAgent().retrieve(
        db,
        tenant_id=tenant_id,
        query="Relevant prior context",
        top_k=3,
    )

    assert result == expected
    retrieve_mock.assert_awaited_once_with(
        db,
        tenant_id=tenant_id,
        query="Relevant prior context",
        top_k=3,
    )


@pytest.mark.asyncio
async def test_memory_agent_rejects_invalid_tenant_before_retrieval(monkeypatch):
    import app.multi_agent.agents as agents_module

    retrieve_mock = AsyncMock()
    monkeypatch.setattr(agents_module, "retrieve_chunks", retrieve_mock)

    with pytest.raises(TypeError, match="tenant_id"):
        await MemoryAgent().retrieve(
            object(),
            tenant_id="not-a-uuid",
            query="Relevant context",
        )

    retrieve_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_reviewer_validates_structured_provider_output():
    class Provider:
        async def review(self, request, outputs):
            return {
                "approved": True,
                "final_answer": "The approved answer",
                "feedback": "Supported by the evidence",
            }

    result = await ReviewerAgent(Provider()).review(
        TaskRequest(prompt="Answer this"),
        {"research": "Relevant evidence"},
    )

    assert result.approved is True
    assert result.final_answer == "The approved answer"


@pytest.mark.asyncio
async def test_reviewer_rejects_approval_without_final_answer():
    class Provider:
        async def review(self, request, outputs):
            return {
                "approved": True,
                "feedback": "Looks good",
            }

    with pytest.raises(ValueError, match="final answer"):
        await ReviewerAgent(Provider()).review(
            TaskRequest(prompt="Answer this"),
            {"research": "Relevant evidence"},
        )


@pytest.mark.asyncio
async def test_agents_wire_into_coordinator():
    from app.multi_agent.coordinator import MultiAgentCoordinator
    from app.multi_agent.contracts import TaskStatus

    class PlannerProvider:
        async def plan(self, request):
            return TaskPlan(
                steps=[
                    PlanStep(
                        id="answer",
                        objective="Draft an answer",
                        expected_output="A concise answer",
                    )
                ]
            )

    class ExecutorProvider:
        async def execute(self, step, dependency_outputs):
            return "Draft answer"

    class ReviewerProvider:
        async def review(self, request, outputs):
            return ReviewResult(
                approved=True,
                final_answer="The approved answer",
                feedback="Supported",
            )

    planner = PlannerAgent(PlannerProvider())
    executor = ExecutorAgent(ExecutorProvider())
    reviewer = ReviewerAgent(ReviewerProvider())

    coordinator = MultiAgentCoordinator(
        planner.plan,
        executor.execute,
        reviewer.review,
    )

    result = await coordinator.run(TaskRequest(prompt="Answer this"))

    assert result.status == TaskStatus.COMPLETED
    assert result.final_output == "The approved answer"
