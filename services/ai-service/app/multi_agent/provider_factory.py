"""Dedicated provider factory for multi-agent workflows."""

import os
from dataclasses import dataclass

from app.multi_agent.agents import (
    ExecutorProvider,
    PlannerProvider,
    ReviewerProvider,
)
from app.multi_agent.providers import (
    LiteLLMMultiAgentProvider,
    MockMultiAgentProvider,
)


@dataclass(frozen=True)
class MultiAgentProviders:
    planner: PlannerProvider
    executor: ExecutorProvider
    reviewer: ReviewerProvider


def get_multi_agent_providers() -> MultiAgentProviders:
    """Build multi-agent providers without changing AI_PROVIDER."""

    provider_name = os.getenv("MULTI_AGENT_PROVIDER", "mock").strip().lower()

    if provider_name == "mock":
        provider = MockMultiAgentProvider()
    elif provider_name == "litellm":
        provider = LiteLLMMultiAgentProvider()
    else:
        raise ValueError(
            "MULTI_AGENT_PROVIDER must be either 'mock' or 'litellm'"
        )

    return MultiAgentProviders(
        planner=provider,
        executor=provider,
        reviewer=provider,
    )
