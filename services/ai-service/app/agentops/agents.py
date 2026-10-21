"""Role-specific components for bounded incident investigations."""

from app.agentops.contracts import (
    Evidence,
    InvestigationContext,
    InvestigationResult,
)
from app.agentops.providers.base import InvestigationProvider


DIAGNOSIS_ALLOWED_TOOLS = frozenset({
    "get_incident_details",
    "search_incident_evidence",
    "get_service_health",
})

DIAGNOSIS_ALLOWED_REMOTE_TOOLS = frozenset({
    "search_records",
})


class EvidenceRetrievalAgent:
    """Select and validate the evidence available to an investigation."""

    name = "evidence_retrieval"
    allowed_tools = frozenset()

    async def retrieve(
        self,
        context: InvestigationContext,
    ) -> list[Evidence]:
        evidence = list(context.evidence)

        if not evidence:
            raise ValueError("Evidence agent collected no incident evidence")

        evidence_ids = [item.id for item in evidence]
        if len(evidence_ids) != len(set(evidence_ids)):
            raise ValueError("Duplicate evidence IDs are not allowed")

        return evidence


class DiagnosisAgent:
    """Produce a diagnosis proposal using the configured provider."""

    name = "diagnosis"
    allowed_tools = DIAGNOSIS_ALLOWED_TOOLS

    def __init__(self, provider: InvestigationProvider) -> None:
        self.provider = provider

    async def diagnose(
        self,
        context: InvestigationContext,
        evidence: list[Evidence],
    ) -> dict:
        if not evidence:
            raise ValueError("Diagnosis requires collected evidence")

        scoped_context = context.model_copy(update={"evidence": evidence})
        return await self.provider.investigate(scoped_context)


class VerificationAgent:
    """Validate diagnosis structure and its grounding in collected evidence."""

    name = "verification"
    allowed_tools = frozenset()

    def verify(
        self,
        raw_result: dict,
        evidence: list[Evidence],
    ) -> InvestigationResult:
        result = InvestigationResult.model_validate(raw_result)
        evidence_by_id = {item.id: item for item in evidence}

        if not evidence_by_id:
            raise ValueError("Verification requires collected evidence")

        for hypothesis in result.hypotheses:
            cited_ids = set(hypothesis.evidence_ids)
            unknown_ids = cited_ids - evidence_by_id.keys()

            if unknown_ids:
                raise ValueError(
                    "Investigation referenced evidence that was not collected"
                )

            if not any(
                hypothesis.id in evidence_by_id[evidence_id].supports
                for evidence_id in cited_ids
            ):
                raise ValueError(
                    "Hypothesis is not supported by its cited evidence"
                )

        return result


class InvestigationSupervisor:
    """Accept only a successfully verified investigation result."""

    name = "supervisor"
    allowed_tools = frozenset()

    def accept(
        self,
        verified_result: InvestigationResult | None,
        verification_passed: bool,
    ) -> InvestigationResult:
        if verification_passed is not True:
            raise ValueError(
                "Supervisor rejected an unverified investigation"
            )

        if verified_result is None:
            raise ValueError(
                "Supervisor received no verified investigation"
            )

        return verified_result
