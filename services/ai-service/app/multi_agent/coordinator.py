"""Deterministic, bounded coordinator for the multi-agent core."""

import asyncio
from collections.abc import Awaitable, Callable

from app.multi_agent.contracts import (
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

MAX_STEP_OUTPUT_CHARS = 8_000


class MultiAgentCoordinator:
    """Run a validated plan with bounded concurrency and one task deadline."""

    def __init__(
        self,
        planner: Planner,
        executor: Executor,
        reviewer: Reviewer,
        *,
        max_concurrency: int = 3,
    ) -> None:
        if isinstance(max_concurrency, bool) or not 1 <= max_concurrency <= 4:
            raise ValueError("max_concurrency must be between 1 and 4")

        self._planner = planner
        self._executor = executor
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
            )
        except asyncio.CancelledError:
            raise
        except Exception:
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
        semaphore = asyncio.Semaphore(self._max_concurrency)

        async def execute(step: PlanStep) -> tuple[str, StepResult]:
            async with semaphore:
                try:
                    progress_statuses[step.id] = StepStatus.RUNNING.value
                    await emit("executing")
                    dependency_outputs = {
                        dependency: completed[dependency]
                        for dependency in step.depends_on
                    }
                    output = await self._executor(step, dependency_outputs)
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
                    completed[step_id] = result.output or ""

        ordered_results = [results[step.id] for step in plan.steps]
        if any(item.status != StepStatus.COMPLETED for item in ordered_results):
            await emit("failed")
            return TaskResult(
                status=TaskStatus.FAILED,
                steps=ordered_results,
                final_output=None,
            )

        await emit("reviewing")
        try:
            review = await self._reviewer(request, dict(completed))
        except asyncio.CancelledError:
            raise
        except Exception:
            await emit("failed")
            return TaskResult(
                status=TaskStatus.FAILED,
                steps=ordered_results,
                final_output=None,
            )

        if not isinstance(review, ReviewResult) or not review.approved:
            await emit("failed")
            return TaskResult(
                status=TaskStatus.FAILED,
                steps=ordered_results,
                final_output=None,
            )

        final_output = (review.final_answer or "").strip()
        if not final_output:
            await emit("failed")
            return TaskResult(
                status=TaskStatus.FAILED,
                steps=ordered_results,
                final_output=None,
            )

        await emit("completed")
        return TaskResult(
            status=TaskStatus.COMPLETED,
            steps=ordered_results,
            final_output=final_output[:MAX_STEP_OUTPUT_CHARS],
        )
