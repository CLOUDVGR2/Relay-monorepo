"""Tests for test litellm provider in the Relay AI service."""


import json
from types import SimpleNamespace

import pytest

from app.agentops.contracts import InvestigationContext
from app.agentops.providers import litellm_provider
from app.agentops.providers.litellm_provider import (
    InvestigationProviderError,
    LiteLLMInvestigationProvider,
)


@pytest.fixture
def context():
    return InvestigationContext.model_validate(
        {
            "scenario_id": "api-latency-spike-v1",
            "service": "api",
            "signal": {
                "metric": "request_p95_ms",
                "baseline_ms": 180,
                "observed_ms": 2400,
                "threshold_ms": 800,
            },
            "evidence": [
                {
                    "id": "evidence-1",
                    "type": "metric",
                    "source": "test",
                    "observation": "Request p95 latency increased to 2400 ms",
                    "supports": ["connection_pool_pressure"],
                }
            ],
        }
    )


@pytest.fixture
def valid_response():
    return {
        "summary": "Latency is elevated based on the supplied evidence.",
        "hypotheses": [
            {
                "id": "connection_pool_pressure",
                "summary": "Possible database connection pool pressure",
                "confidence": 0.8,
                "evidence_ids": ["evidence-1"],
            }
        ],
        "proposed_action": {
            "action_id": "simulate_pool_recovery",
            "description": "Simulate recovery of the connection pool",
            "risk": "low",
            "execution_environment": "simulator",
        },
        "limitations": ["This is an evidence-based hypothesis, not proof."],
    }


@pytest.mark.asyncio
async def test_litellm_provider_returns_validated_result(
    monkeypatch, context, valid_response
):
    captured = {}

    async def fake_acompletion(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=json.dumps(valid_response)
                    )
                )
            ]
        )

    monkeypatch.setattr(
        litellm_provider, "acompletion", fake_acompletion
    )
    monkeypatch.setenv("AI_PROVIDER_API_KEY", "test-provider-key")
    monkeypatch.setenv("LITELLM_API_BASE", "http://localhost:11434")

    provider = LiteLLMInvestigationProvider(
        model="openai/test-model",
        timeout=7,
    )
    result = await provider.investigate(context)

    assert result["summary"] == valid_response["summary"]
    assert result["proposed_action"]["execution_environment"] == "simulator"
    assert captured["model"] == "openai/test-model"
    assert captured["timeout"] == 7
    assert captured["api_key"] == "test-provider-key"
    assert captured["api_base"] == "http://localhost:11434"
    assert "response_format" not in captured
    assert "evidence-1" in captured["messages"][1]["content"]

    system_prompt = captured["messages"][0]["content"]
    assert "from 0 to 1 inclusive" in system_prompt
    assert "Never express confidence as a percentage" in system_prompt


@pytest.mark.asyncio
async def test_litellm_provider_rejects_invalid_structured_output(
    monkeypatch, context
):
    async def fake_acompletion(**kwargs):
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content='{"unexpected": true}')
                )
            ]
        )

    monkeypatch.setattr(
        litellm_provider, "acompletion", fake_acompletion
    )

    provider = LiteLLMInvestigationProvider(model="openai/test-model")

    with pytest.raises(
        InvestigationProviderError,
        match="invalid structured output",
    ):
        await provider.investigate(context)


@pytest.mark.asyncio
async def test_litellm_provider_wraps_request_errors(
    monkeypatch, context
):
    async def fake_acompletion(**kwargs):
        raise RuntimeError("sensitive provider details")

    monkeypatch.setattr(
        litellm_provider, "acompletion", fake_acompletion
    )

    provider = LiteLLMInvestigationProvider(model="openai/test-model")

    with pytest.raises(
        InvestigationProviderError,
        match="request failed",
    ) as error:
        await provider.investigate(context)

    assert "sensitive provider details" not in str(error.value)


def test_litellm_provider_rejects_unbounded_timeout():
    with pytest.raises(ValueError, match="between 1 and 120"):
        LiteLLMInvestigationProvider(timeout=500)


def test_litellm_provider_rejects_empty_model():
    with pytest.raises(ValueError, match="must not be empty"):
        LiteLLMInvestigationProvider(model="   ")
