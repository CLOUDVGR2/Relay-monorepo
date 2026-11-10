"""Deterministic, bounded coordinator for the multi-agent core."""

import asyncio
import json
import logging
import uuid
from collections.abc import Awaitable, Callable, Mapping

from app.multi_agent.agents import DependencyOutputs

from app.multi_agent.contracts import (
    AgentRole,
    PlanStep,
    ReviewResult,
    StepResult,
    StepStatus,
    TaskPlan,
    TaskRequest,
    TaskResult,
    TaskStatus,
)


Planner = Callable[[TaskRequest], Awaitable[TaskPlan]]
Executor = Callable[[PlanStep, dict[str, str]], Awaitable[str]]
Reviewer = Callable[[TaskRequest, dict[str, str]], Awaitable[ReviewResult]]
ProgressCallback = Callable[[dict[str, object]], Awaitable[None]]

logger = logging.getLogger(__name__)

MAX_STEP_OUTPUT_CHARS = 8_000


def _canonical_evidence_refs(output: str) -> set[str]:
    """Extract canonical evidence UUIDs from a trusted Memory result."""
    try:
        payload = json.loads(output)
    except (TypeError, ValueError):
        return set()

    if not isinstance(payload, dict):
        return set()

    evidence = payload.get("evidence")
    if not isinstance(evidence, list):
        return set()

    refs: set[str] = set()
    for item in evidence:
        if not isinstance(item, dict):
            continue
        for field in ("chunk_id", "document_id"):
            value = item.get(field)
            if not isinstance(value, str):
                continue
            try:
                parsed = uuid.UUID(value)
            except (ValueError, AttributeError):
                continue
            if str(parsed) == value:
                refs.add(value)
    return refs


def _propagated_evidence_refs(
    output: str,
    inherited_refs: set[str],
) -> set[str]:
    """Propagate only inherited references explicitly retained by a specialist."""
    try:
        payload = json.loads(output)
    except (TypeError, ValueError):
        return set()

    if not isinstance(payload, dict):
        return set()

    proposed = payload.get("evidence_refs")
    if not isinstance(proposed, list):
        return set()

    return {
        ref for ref in proposed
        if isinstance(ref, str) and ref in inherited_refs
    }


class MultiAgentCoordinator:
    """Run a validated plan with bounded concurrency and one task deadline."""

    def __init__(
        self,
        planner: Planner,
        executor: Executor,
        reviewer: Reviewer,
        *,
        max_concurrency: int = 3,
        role_executors: Mapping[AgentRole, Executor] | None = None,
    ) -> None:
        if isinstance(max_concurrency, bool) or not 1 <= max_concurrency <= 4:
            raise ValueError("max_concurrency must be between 1 and 4")

        self._planner = planner
        self._executor = executor
        self._role_executors = dict(role_executors or {})
        self._reviewer = reviewer
        self._max_concurrency = max_concurrency

    async def run(
        self,
        request: TaskRequest,
        *,
        on_progress: ProgressCallback | None = None,
    ) -> TaskResult:
        """Execute under one deadline, preserving known step results on timeout."""
        plan: TaskPlan | None = None
        results: dict[str, StepResult] = {}

        try:
            async with asyncio.timeout(request.timeout_seconds):
                proposed_plan = await self._planner(request)
                plan = (
                    proposed_plan
                    if isinstance(proposed_plan, TaskPlan)
                    else TaskPlan.model_validate(proposed_plan)
                )

                if len(plan.steps) > request.max_steps:
                    raise ValueError("Planner exceeded the requested step limit")

                if on_progress is not None:
                    await self._notify_progress(
                        on_progress,
                        {
                            "phase": "planning",
                            "steps": [
                                {
                                    "step_id": step.id,
                                    "role": step.role.value,
                                    "status": StepStatus.PENDING.value,
                                }
                                for step in plan.steps
                            ],
                        },
                    )
                return await self._execute_plan(
                    request, plan, results, on_progress=on_progress
                )
        except TimeoutError:
            if plan is None:
                if on_progress is not None:
                    await self._notify_progress(
                        on_progress,
                        {"phase": "failed", "steps": []},
                    )
                return TaskResult(
                    status=TaskStatus.FAILED,
                    steps=[],
                    final_output=None,
                    error_message="I couldn't create an execution plan for this task. Please try again with more detail.",
                )

            # A timeout may interrupt a concurrent batch. Keep completed
            # results and represent every other planned step without exposing
            # provider exception details.
            for step in plan.steps:
                if step.id not in results:
                    results[step.id] = StepResult(
                        step_id=step.id,
                        role=step.role,
                        status=StepStatus.FAILED,
                        error_code="task_timeout",
                    )

            if on_progress is not None:
                await self._notify_progress(
                    on_progress,
                    {
                        "phase": "failed",
                        "steps": [
                            {
                                "step_id": step.id,
                                "role": step.role.value,
                                "status": results[step.id].status.value,
                            }
                            for step in plan.steps
                        ],
                    },
                )
            return TaskResult(
                status=TaskStatus.FAILED,
                steps=[results[step.id] for step in plan.steps],
                final_output=None,
                error_message="The task took longer than the allowed time. Please simplify it and try again.",
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception(
                "multi_agent_coordinator_failed",
                extra={"stage": "planning_or_coordination"},
            )
            # Persist a safe terminal snapshot even when planning or
            # coordination fails unexpectedly. Never expose exception text.
            if on_progress is not None:
                await self._notify_progress(
                    on_progress,
                    {
                        "phase": "failed",
                        "steps": [] if plan is None else [
                            {
                                "step_id": step.id,
                                "role": step.role.value,
                                "status": (
                                    results[step.id].status.value
                                    if step.id in results
                                    else StepStatus.FAILED.value
                                ),
                            }
                            for step in plan.steps
                        ],
                    },
                )

            return TaskResult(
                status=TaskStatus.FAILED,
                steps=[] if plan is None else [
                    results[step.id]
                    for step in plan.steps
                    if step.id in results
                ],
                final_output=None,
                error_message="The task encountered an internal execution problem. Please try again.",
            )

    async def _notify_progress(
        self,
        callback: ProgressCallback,
        snapshot: dict[str, object],
    ) -> None:
        """Keep progress delivery failures from failing task execution."""
        try:
            await callback(snapshot)
        except asyncio.CancelledError:
            raise
        except Exception:
            # Durable task execution remains authoritative. Delivery and
            # persistence failures are handled by the worker callback.
            return

    async def _execute_plan(
        self,
        request: TaskRequest,
        plan: TaskPlan,
        results: dict[str, StepResult],
        *,
        on_progress: ProgressCallback | None = None,
    ) -> TaskResult:
        by_id = {step.id: step for step in plan.steps}
        progress_statuses = {
            step.id: StepStatus.PENDING.value for step in plan.steps
        }
        progress_lock = asyncio.Lock()

        async def emit(phase: str) -> None:
            if on_progress is None:
                return
            async with progress_lock:
                snapshot = {
                    "phase": phase,
                    "steps": [
                        {
                            "step_id": step.id,
                            "role": step.role.value,
                            "status": progress_statuses[step.id],
                        }
                        for step in plan.steps
                    ],
                }
                await self._notify_progress(on_progress, snapshot)
        pending = set(by_id)
        completed: dict[str, str] = {}
        provenance_by_step: dict[str, set[str]] = {}
        semaphore = asyncio.Semaphore(self._max_concurrency)

        async def execute(step: PlanStep) -> tuple[str, StepResult]:
            async with semaphore:
                try:
                    progress_statuses[step.id] = StepStatus.RUNNING.value
                    await emit("executing")
                    dependency_refs = set().union(
                        *(
                            provenance_by_step.get(dependency, set())
                            for dependency in step.depends_on
                        )
                    )
                    dependency_outputs = DependencyOutputs(
                        {
                            dependency: completed[dependency]
                            for dependency in step.depends_on
                        },
                        evidence_refs=dependency_refs,
                    )
                    handler = self._role_executors.get(step.role, self._executor)
                    output = await handler(step, dependency_outputs)
                    if not isinstance(output, str) or not output.strip():
                        raise ValueError("empty_output")
                    if len(output) > MAX_STEP_OUTPUT_CHARS:
                        raise ValueError("output_too_large")

                    result = StepResult(
                        step_id=step.id,
                        role=step.role,
                        status=StepStatus.COMPLETED,
                        output=output,
                    )
                except asyncio.CancelledError:
                    raise
                except Exception:
                    logger.exception(
                        "multi_agent_step_execution_failed",
                        extra={
                            "step_id": step.id,
                            "role": step.role.value,
                        },
                    )
                    result = StepResult(
                        step_id=step.id,
                        role=step.role,
                        status=StepStatus.FAILED,
                        error_code="execution_failed",
                    )
                results[step.id] = result
                progress_statuses[step.id] = result.status.value
                await emit("executing")
                return step.id, result

        while pending:
            ready = [
                by_id[step_id]
                for step_id in pending
                if all(dep in completed for dep in by_id[step_id].depends_on)
            ]

            blocked = [
                step_id
                for step_id in pending
                if any(
                    dep in results and results[dep].status != StepStatus.COMPLETED
                    for dep in by_id[step_id].depends_on
                )
            ]

            for step_id in blocked:
                step = by_id[step_id]
                results[step_id] = StepResult(
                    step_id=step_id,
                    role=step.role,
                    status=StepStatus.SKIPPED,
                    error_code="dependency_failed",
                )
                pending.remove(step_id)
                progress_statuses[step_id] = StepStatus.SKIPPED.value
            if blocked:
                await emit("executing")

            if not ready:
                if pending:
                    raise ValueError("Plan cannot make further progress")
                break

            batch = ready[: self._max_concurrency]
            batch_results = await asyncio.gather(
                *(execute(step) for step in batch)
            )

            for step_id, result in batch_results:
                pending.remove(step_id)
                if result.status == StepStatus.COMPLETED:
                    output = result.output or ""
                    completed[step_id] = output
                    step = by_id[step_id]
                    if (
                        step.role == AgentRole.MEMORY
                        and step.role in self._role_executors
                    ):
                        provenance_by_step[step_id] = (
                            _canonical_evidence_refs(output)
                        )
                    elif step.role in {
                        AgentRole.RESEARCHER,
                        AgentRole.ANALYST,
                        AgentRole.WRITER,
                    }:
                        inherited_refs = set().union(
                            *(
                                provenance_by_step.get(dependency, set())
                                for dependency in step.depends_on
                            )
                        )
                        provenance_by_step[step_id] = (
                            _propagated_evidence_refs(output, inherited_refs)
                        )

        ordered_results = [results[step.id] for step in plan.steps]
        if any(item.status != StepStatus.COMPLETED for item in ordered_results):
            await emit("failed")
            return TaskResult(
                status=TaskStatus.FAILED,
                steps=ordered_results,
                final_output=None,
                error_message="One or more task steps could not be completed. Review the step statuses and try again.",
            )

        await emit("reviewing")
        try:
            review = await self._reviewer(request, dict(completed))
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("multi_agent_review_failed")
            await emit("failed")
            return TaskResult(
                status=TaskStatus.FAILED,
                steps=ordered_results,
                final_output=None,
                error_message="The task could not produce a result that passed review. Please add context and try again.",
            )

        if not isinstance(review, ReviewResult) or not review.approved:
            await emit("failed")
            return TaskResult(
                status=TaskStatus.FAILED,
                steps=ordered_results,
                final_output=None,
                error_message="The task result did not pass review. Please add context and try again.",
            )

        final_output = (review.final_answer or "").strip()
        final_output = final_output.replace("\\r\\n", "\n").replace("\\n", "\n")
        if not final_output:
            await emit("failed")
            return TaskResult(
                status=TaskStatus.FAILED,
                steps=ordered_results,
                final_output=None,
                error_message="The task review did not produce a final answer. Please try again.",
            )

        await emit("completed")
        return TaskResult(
            status=TaskStatus.COMPLETED,
            steps=ordered_results,
            final_output=final_output[:MAX_STEP_OUTPUT_CHARS],
        )
