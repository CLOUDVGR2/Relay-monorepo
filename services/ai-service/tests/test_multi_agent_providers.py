"""Tests for isolated multi-agent provider implementations."""

import json
from types import SimpleNamespace

import pytest

from app.multi_agent.contracts import (
    PlanStep,
    ReviewResult,
    TaskPlan,
    TaskRequest,
)
from app.multi_agent.provider_factory import get_multi_agent_providers
from app.multi_agent.providers import (
    LiteLLMMultiAgentProvider,
    MockMultiAgentProvider,
    MultiAgentProviderError,
)


def fake_response(content):
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content=content)
            )
        ]
    )


def test_factory_defaults_to_mock(monkeypatch):
    monkeypatch.delenv("MULTI_AGENT_PROVIDER", raising=False)
    providers = get_multi_agent_providers()
    assert isinstance(providers.planner, MockMultiAgentProvider)
    assert providers.planner is providers.executor
    assert providers.executor is providers.reviewer


def test_factory_explicit_mock_does_not_change_investigation_setting(
    monkeypatch,
):
    monkeypatch.setenv("MULTI_AGENT_PROVIDER", "mock")
    monkeypatch.setenv("AI_PROVIDER", "litellm")

    providers = get_multi_agent_providers()

    assert isinstance(providers.planner, MockMultiAgentProvider)
    assert __import__("os").environ["AI_PROVIDER"] == "litellm"


def test_factory_creates_litellm_provider(monkeypatch):
    monkeypatch.setenv("MULTI_AGENT_PROVIDER", "litellm")
    monkeypatch.setenv("MULTI_AGENT_MODEL", "openai/test-model")
    providers = get_multi_agent_providers()

    assert isinstance(providers.planner, LiteLLMMultiAgentProvider)
    assert providers.planner.model == "openai/test-model"


def test_factory_rejects_unknown_provider(monkeypatch):
    monkeypatch.setenv("MULTI_AGENT_PROVIDER", "unknown")
    with pytest.raises(ValueError, match="MULTI_AGENT_PROVIDER"):
        get_multi_agent_providers()


@pytest.mark.asyncio
async def test_mock_provider_returns_valid_plan():
    provider = MockMultiAgentProvider()
    request = TaskRequest(prompt="Summarize the incident")

    plan = await provider.plan(request)

    assert isinstance(plan, TaskPlan)
    assert len(plan.steps) == 1
    assert plan.steps[0].objective == request.prompt


@pytest.mark.asyncio
async def test_mock_provider_executes_without_network():
    provider = MockMultiAgentProvider()
    step = PlanStep(
        id="analyze",
        objective="Analyze the supplied evidence",
        expected_output="Summary",
    )

    output = await provider.execute(step, {})

    assert "Analyze the supplied evidence" in output


@pytest.mark.asyncio
async def test_mock_provider_reviews_outputs():
    provider = MockMultiAgentProvider()

    result = await provider.review(
        TaskRequest(prompt="Summarize"),
        {"first": "Evidence summary"},
    )

    assert result.approved
    assert "Evidence summary" in result.final_answer


@pytest.mark.asyncio
async def test_litellm_plan_uses_structured_output_and_validates(
    monkeypatch,
):
    import app.multi_agent.providers as module

    calls = []

    async def fake_acompletion(**kwargs):
        calls.append(kwargs)
        return fake_response(
            json.dumps(
                {
                    "steps": [
                        {
                            "id": "summarize",
                            "role": "executor",
                            "depends_on": [],
                            "objective": "Summarize evidence",
                            "expected_output": "A summary",
                        }
                    ]
                }
            )
        )

    monkeypatch.setattr(module, "acompletion", fake_acompletion)
    monkeypatch.setenv("MULTI_AGENT_MODEL", "openai/test-model")
    monkeypatch.setenv("MULTI_AGENT_TIMEOUT_SECONDS", "10")
    monkeypatch.setenv("AI_PROVIDER_API_KEY", "test-key")
    monkeypatch.setenv("LITELLM_API_BASE", "https://provider.invalid/v1")

    provider = LiteLLMMultiAgentProvider()
    result = await provider.plan(TaskRequest(prompt="Summarize"))

    assert isinstance(result, TaskPlan)
    assert calls[0]["model"] == "openai/test-model"
    assert calls[0]["timeout"] == 10
    assert calls[0]["api_key"] == "test-key"
    assert calls[0]["api_base"] == "https://provider.invalid/v1"
    assert calls[0]["response_format"] is TaskPlan
    assert calls[0]["temperature"] == 0


@pytest.mark.asyncio
async def test_litellm_executor_rejects_empty_content(monkeypatch):
    import app.multi_agent.providers as module

    async def fake_acompletion(**kwargs):
        return fake_response("   ")

    monkeypatch.setattr(module, "acompletion", fake_acompletion)
    provider = LiteLLMMultiAgentProvider()

    with pytest.raises(MultiAgentProviderError, match="empty"):
        await provider.execute(
            PlanStep(
                id="execute",
                objective="Perform task",
                expected_output="Output",
            ),
            {},
        )


@pytest.mark.asyncio
async def test_litellm_rejects_invalid_plan(monkeypatch):
    import app.multi_agent.providers as module

    async def fake_acompletion(**kwargs):
        return fake_response('{"steps": []}')

    monkeypatch.setattr(module, "acompletion", fake_acompletion)
    provider = LiteLLMMultiAgentProvider()

    with pytest.raises(
        MultiAgentProviderError,
        match="invalid structured output",
    ):
        await provider.plan(TaskRequest(prompt="Summarize"))


@pytest.mark.asyncio
async def test_litellm_wraps_provider_error_without_leaking_details(
    monkeypatch,
):
    import app.multi_agent.providers as module

    async def fake_acompletion(**kwargs):
        raise RuntimeError("secret-token-and-sensitive-prompt")

    monkeypatch.setattr(module, "acompletion", fake_acompletion)
    provider = LiteLLMMultiAgentProvider()

    with pytest.raises(MultiAgentProviderError) as caught:
        await provider.plan(TaskRequest(prompt="Summarize"))

    assert "secret-token" not in str(caught.value)
    assert "sensitive-prompt" not in str(caught.value)


@pytest.mark.parametrize("timeout", [0, -1, 121])
def test_litellm_rejects_out_of_range_timeout(timeout):
    with pytest.raises(ValueError, match="timeout"):
        LiteLLMMultiAgentProvider(timeout=timeout)


def test_litellm_rejects_empty_model():
    with pytest.raises(ValueError, match="model"):
        LiteLLMMultiAgentProvider(model="  ")


@pytest.mark.asyncio
async def test_litellm_review_validates_schema(monkeypatch):
    import app.multi_agent.providers as module

    async def fake_acompletion(**kwargs):
        assert kwargs["response_format"] is ReviewResult
        return fake_response(
            json.dumps(
                {
                    "approved": True,
                    "final_answer": "Validated answer",
                    "feedback": "Supported by supplied output",
                }
            )
        )

    monkeypatch.setattr(module, "acompletion", fake_acompletion)
    provider = LiteLLMMultiAgentProvider()

    result = await provider.review(
        TaskRequest(prompt="Summarize"),
        {"step-1": "Observed fact"},
    )

    assert result.approved
    assert result.final_answer == "Validated answer"
