"""Mock module for the Relay AI service."""


from app.agentops.contracts import InvestigationContext


class MockInvestigationProvider:
    """Deterministic provider for tests and local development."""

    name = "mock"

    async def investigate(self, context: InvestigationContext) -> dict:
        evidence_ids = {item.id for item in context.evidence}
        support_counts: dict[str, int] = {}

        for item in context.evidence:
            for hypothesis_id in item.supports:
                support_counts[hypothesis_id] = (
                    support_counts.get(hypothesis_id, 0) + 1
                )

        hypotheses = []
        for hypothesis_id, count in support_counts.items():
            supporting = [
                item.id
                for item in context.evidence
                if hypothesis_id in item.supports
            ]
            hypotheses.append({
                "id": hypothesis_id,
                "summary": hypothesis_id.replace("_", " ").capitalize(),
                "confidence": round(count / max(len(context.evidence), 1), 3),
                "evidence_ids": supporting,
            })

        hypotheses.sort(
            key=lambda item: item["confidence"],
            reverse=True,
        )

        if not hypotheses:
            hypotheses = [{
                "id": "insufficient_evidence",
                "summary": "Insufficient evidence to identify a root cause",
                "confidence": 0.0,
                "evidence_ids": [next(iter(evidence_ids))],
            }]

        return {
            "summary": (
                f"Investigated {context.service} using "
                f"{len(context.evidence)} evidence records. "
                "This is a deterministic mock result, not an LLM diagnosis."
            ),
            "hypotheses": hypotheses,
            "proposed_action": {
                "action_id": "simulate_pool_recovery",
                "description": "Simulate recovery of the database connection pool",
                "risk": "low",
                "execution_environment": "simulator",
            },
            "limitations": [
                "The mock provider does not call an LLM.",
                "Confidence values are heuristic rankings, not calibrated probabilities.",
                "The recommendation is simulator-only and requires separate approval.",
            ],
        }
