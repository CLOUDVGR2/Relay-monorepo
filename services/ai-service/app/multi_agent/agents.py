"""Provider-independent role agents for Relay's multi-agent workflow."""

import uuid
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from app.multi_agent.contracts import (
    PlanStep,
    ReviewResult,
    TaskPlan,
    TaskRequest,
)
from app.rag.retrieval import RetrievedChunk, retrieve_chunks


class PlannerProvider(Protocol):
    """Provider that proposes a structured execution plan."""

    async def plan(self, request: TaskRequest) -> TaskPlan | dict: ...


class ExecutorProvider(Protocol):
    """Provider that executes one bounded plan step."""

    async def execute(
        self,
        step: PlanStep,
        dependency_outputs: dict[str, str],
    ) -> str: ...


class ReviewerProvider(Protocol):
    """Provider that reviews completed work and drafts the final answer."""

    async def review(
        self,
        request: TaskRequest,
        outputs: dict[str, str],
    ) -> ReviewResult | dict: ...


class PlannerAgent:
    """Produce a validated plan; never execute the proposed steps."""

    name = "planner"

    def __init__(self, provider: PlannerProvider) -> None:
        self._provider = provider

    async def plan(self, request: TaskRequest) -> TaskPlan:
        proposed = await self._provider.plan(request)

        if isinstance(proposed, TaskPlan):
            plan = proposed
        else:
            plan = TaskPlan.model_validate(proposed)

        if len(plan.steps) > request.max_steps:
            raise ValueError("Planner exceeded the requested step limit")

        return plan


class ExecutorAgent:
    """Delegate one step with only its explicitly supplied dependencies."""

    name = "executor"

    def __init__(self, provider: ExecutorProvider) -> None:
        self._provider = provider

    async def execute(
        self,
        step: PlanStep,
        dependency_outputs: dict[str, str],
    ) -> str:
        # Copy the mapping so a provider cannot mutate the coordinator's map.
        scoped_outputs = dict(dependency_outputs)
        output = await self._provider.execute(step, scoped_outputs)

        if not isinstance(output, str) or not output.strip():
            raise ValueError("Executor returned empty output")

        if len(output) > 8_000:
            raise ValueError("Executor output exceeded the size limit")

        return output.strip()


class MemoryAgent:
    """Retrieve tenant-scoped evidence using Relay's existing RAG layer."""

    name = "memory"

    async def retrieve(
        self,
        db: AsyncSession,
        *,
        tenant_id: uuid.UUID,
        query: str,
        top_k: int = 5,
    ) -> list[RetrievedChunk]:
        if not isinstance(tenant_id, uuid.UUID):
            raise TypeError("tenant_id must be a UUID")

        # retrieve_chunks validates query/top_k and applies tenant filters
        # to both semantic and keyword retrieval.
        return await retrieve_chunks(
            db,
            tenant_id=tenant_id,
            query=query,
            top_k=top_k,
        )


class ReviewerAgent:
    """Validate reviewer output before the coordinator can accept it."""

    name = "reviewer"

    def __init__(self, provider: ReviewerProvider) -> None:
        self._provider = provider

    async def review(
        self,
        request: TaskRequest,
        outputs: dict[str, str],
    ) -> ReviewResult:
        # Prevent the provider from mutating the coordinator's output mapping.
        proposed = await self._provider.review(request, dict(outputs))

        if isinstance(proposed, ReviewResult):
            result = proposed
        else:
            result = ReviewResult.model_validate(proposed)

        if result.approved and not (result.final_answer or "").strip():
            raise ValueError("Approved review must include a final answer")

        return result
