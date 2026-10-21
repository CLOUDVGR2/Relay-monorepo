"""Tests for test provider factory in the Relay AI service."""


import pytest

from app.agentops.providers.factory import get_investigation_provider
from app.agentops.providers.mock import MockInvestigationProvider
from app.agentops.providers.litellm_provider import LiteLLMInvestigationProvider


def test_provider_defaults_to_mock(monkeypatch):
    monkeypatch.delenv("AI_PROVIDER", raising=False)

    provider = get_investigation_provider()

    assert isinstance(provider, MockInvestigationProvider)


def test_provider_selects_mock_explicitly(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "mock")

    assert isinstance(
        get_investigation_provider(),
        MockInvestigationProvider,
    )


def test_provider_selects_litellm(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "litellm")

    provider = get_investigation_provider()

    assert isinstance(provider, LiteLLMInvestigationProvider)


def test_provider_rejects_unknown_configuration(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "unknown")

    with pytest.raises(ValueError, match="AI_PROVIDER"):
        get_investigation_provider()
