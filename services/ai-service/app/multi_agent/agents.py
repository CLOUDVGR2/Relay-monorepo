"""Provider-independent role agents for Relay's multi-agent workflow."""

import json
import uuid
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from app.multi_agent.contracts import (
    PlanStep,
    ReviewResult,
    SpecialistOutput,
    TaskPlan,
    TaskRequest,
    MAX_STEP_OUTPUT_CHARS,
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


class ResearcherProvider(Protocol):
    """Provider operation for evidence synthesis and research gaps."""

    async def research(
        self,
        step: PlanStep,
        dependency_outputs: dict[str, str],
    ) -> SpecialistOutput | dict: ...


class AnalystProvider(Protocol):
    """Provider operation for evidence evaluation and reasoned analysis."""

    async def analyze(
        self,
        step: PlanStep,
        dependency_outputs: dict[str, str],
    ) -> SpecialistOutput | dict: ...


class WriterProvider(Protocol):
    """Provider operation for grounded drafting and deliverable production."""

    async def write(
        self,
        step: PlanStep,
        dependency_outputs: dict[str, str],
    ) -> SpecialistOutput | dict: ...


class DependencyOutputs(dict[str, str]):
    """Dependency outputs with coordinator-verified evidence provenance."""

    def __init__(
        self,
        outputs: dict[str, str],
        *,
        evidence_refs: set[str],
    ) -> None:
        super().__init__(outputs)
        self.evidence_refs = frozenset(evidence_refs)


def _available_evidence_refs(
    dependency_outputs: dict[str, str],
) -> set[str]:
    """Return only evidence references verified by the coordinator."""
    refs = getattr(dependency_outputs, "evidence_refs", ())
    if not isinstance(refs, (set, frozenset)):
        return set()
    return set(refs)


def _validate_specialist_result(
    proposed: SpecialistOutput | dict,
    dependency_outputs: dict[str, str],
) -> str:
    if isinstance(proposed, SpecialistOutput):
        result = proposed
    else:
        result = SpecialistOutput.model_validate(proposed)

    available_refs = _available_evidence_refs(dependency_outputs)
    unsupported_refs = set(result.evidence_refs) - available_refs
    if unsupported_refs:
        raise ValueError(
            "Specialist output contains unsupported evidence references"
        )

    # Keep provenance and limitations available to downstream steps.
    serialized = result.model_dump_json()
    if len(serialized) > MAX_STEP_OUTPUT_CHARS:
        raise ValueError("Specialist output exceeded the size limit")
    return serialized


class ResearcherAgent:
    """Synthesize supplied evidence and make uncertainty explicit."""

    name = "researcher"

    def __init__(self, provider: ResearcherProvider) -> None:
        self._provider = provider

    async def research(
        self,
        step: PlanStep,
        dependency_outputs: dict[str, str],
    ) -> str:
        proposed = await self._provider.research(step, DependencyOutputs(
            dict(dependency_outputs),
            evidence_refs=_available_evidence_refs(dependency_outputs),
        ))
        return _validate_specialist_result(proposed, dependency_outputs)


class AnalystAgent:
    """Evaluate supplied evidence and explain supported conclusions."""

    name = "analyst"

    def __init__(self, provider: AnalystProvider) -> None:
        self._provider = provider

    async def analyze(
        self,
        step: PlanStep,
        dependency_outputs: dict[str, str],
    ) -> str:
        proposed = await self._provider.analyze(step, DependencyOutputs(
            dict(dependency_outputs),
            evidence_refs=_available_evidence_refs(dependency_outputs),
        ))
        return _validate_specialist_result(proposed, dependency_outputs)


class WriterAgent:
    """Produce a requested deliverable without inventing unsupported facts."""

    name = "writer"

    def __init__(self, provider: WriterProvider) -> None:
        self._provider = provider

    async def write(
        self,
        step: PlanStep,
        dependency_outputs: dict[str, str],
    ) -> str:
        proposed = await self._provider.write(step, DependencyOutputs(
            dict(dependency_outputs),
            evidence_refs=_available_evidence_refs(dependency_outputs),
        ))
        return _validate_specialist_result(proposed, dependency_outputs)


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
