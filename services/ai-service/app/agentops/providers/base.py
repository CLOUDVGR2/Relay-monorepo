"""Data access and persistence integration for the Relay AI service."""


from typing import Protocol

from app.agentops.contracts import InvestigationContext


class InvestigationProvider(Protocol):
    name: str

    async def investigate(self, context: InvestigationContext) -> dict:
        """Return a structured investigation proposal.

        Provider output is untrusted until validated by the workflow.
        This method must not approve or execute remediation.
        """
        ...
