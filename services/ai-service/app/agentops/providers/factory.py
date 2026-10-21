"""Factory module for the Relay AI service."""


import os

from app.agentops.providers.base import InvestigationProvider
from app.agentops.providers.mock import MockInvestigationProvider


def get_investigation_provider() -> InvestigationProvider:
    provider_name = os.getenv("AI_PROVIDER", "mock").strip().lower()

    if provider_name == "mock":
        return MockInvestigationProvider()

    if provider_name == "litellm":
        from app.agentops.providers.litellm_provider import (
            LiteLLMInvestigationProvider,
        )

        return LiteLLMInvestigationProvider()

    raise ValueError("AI_PROVIDER must be either 'mock' or 'litellm'")
