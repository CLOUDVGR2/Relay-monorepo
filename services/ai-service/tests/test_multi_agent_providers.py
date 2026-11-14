"""Tests for isolated multi-agent provider implementations."""

import json
from types import SimpleNamespace

import pytest

from app.multi_agent.contracts import (
    PlanStep,
    ReviewResult,
    SpecialistOutput,
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
    role_providers = (
        providers.planner,
        providers.executor,
        providers.researcher,
        providers.analyst,
        providers.writer,
        providers.reviewer,
    )
    assert all(provider is providers.planner for provider in role_providers)


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
@pytest.mark.parametrize(
    ("method", "role"),
    [
        ("research", "research"),
        ("analyze", "analysis"),
        ("write", "writing"),
    ],
)
async def test_mock_provider_supports_specialist_operations(method, role):
    provider = MockMultiAgentProvider()
    step = PlanStep(
        id="specialist",
        objective="Work with supplied evidence",
        expected_output="Structured result",
    )

    result = await getattr(provider, method)(step, {"source": "Evidence"})

    assert isinstance(result, SpecialistOutput)
    assert role in result.content
    assert "Evidence" in result.content
    assert result.caveats
    assert result.evidence_refs == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "operation", "instruction"),
    [
        ("research", "research", "research specialist"),
        ("analyze", "analyze", "analytical specialist"),
        ("write", "write", "writing specialist"),
    ],
)
async def test_litellm_specialists_use_distinct_structured_operations(
    monkeypatch, method, operation, instruction
):
    import app.multi_agent.providers as module

    calls = []

    async def fake_acompletion(**kwargs):
        calls.append(kwargs)
        return fake_response(
            json.dumps(
                {
                    "content": f"Completed {operation}",
                    "caveats": ["Limited to supplied evidence"],
                    "evidence_refs": ["source-1"],
                }
            )
        )

    monkeypatch.setattr(module, "acompletion", fake_acompletion)
    provider = LiteLLMMultiAgentProvider()
    step = PlanStep(
        id="specialist",
        objective="Work with supplied evidence",
        expected_output="Structured result",
    )

    class VerifiedDependencies(dict):
        evidence_refs = frozenset({"source-1"})

    result = await getattr(provider, method)(
        step,
        VerifiedDependencies({"source": "Evidence"}),
    )

    assert isinstance(result, SpecialistOutput)
    assert result.content == f"Completed {operation}"
    assert calls[0]["response_format"] is SpecialistOutput
    if method == "write":
        system_instructions = calls[0]["messages"][0]["content"]
        assert "return an empty evidence_refs list" in system_instructions
        assert "Never invent placeholder references" in system_instructions
    assert instruction in calls[0]["messages"][0]["content"]
    assert "Evidence" in calls[0]["messages"][1]["content"]
    payload = json.loads(calls[0]["messages"][1]["content"])
    assert payload["allowed_evidence_refs"] == ["source-1"]


@pytest.mark.asyncio
async def test_litellm_specialist_rejects_invalid_structured_output(monkeypatch):
    import app.multi_agent.providers as module

    async def fake_acompletion(**kwargs):
        return fake_response('{"unexpected": "field"}')

    monkeypatch.setattr(module, "acompletion", fake_acompletion)
    provider = LiteLLMMultiAgentProvider()

    with pytest.raises(
        MultiAgentProviderError,
        match="invalid structured output",
    ):
        await provider.research(
            PlanStep(
                id="research",
                objective="Research supplied evidence",
                expected_output="Findings",
            ),
            {},
        )


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
    planner_instructions = calls[0]["messages"][0]["content"]
    assert "Prefer the smallest useful plan" in planner_instructions
    assert "use exactly one specialist step" in planner_instructions
    assert "Never split one writing deliverable" in planner_instructions


@pytest.mark.asyncio
async def test_litellm_plan_removes_terminal_reviewer_step(monkeypatch):
    import app.multi_agent.providers as module

    async def fake_acompletion(**kwargs):
        return fake_response(json.dumps({"steps": [
            {
                "id": "draft",
                "role": "writer",
                "depends_on": [],
                "objective": "Write the requested draft",
                "expected_output": "Draft",
            },
            {
                "id": "review",
                "role": "reviewer",
                "depends_on": ["draft"],
                "objective": "Review and revise the draft",
                "expected_output": "Reviewed draft",
            },
        ]}))

    monkeypatch.setattr(module, "acompletion", fake_acompletion)
    provider = LiteLLMMultiAgentProvider()
    result = await provider.plan(TaskRequest(prompt="Write and review a draft"))

    assert len(result.steps) == 1
    assert result.steps[0].id == "draft"
    assert result.steps[0].role.value == "writer"


@pytest.mark.asyncio
async def test_litellm_plan_rejects_nonterminal_reviewer_step(monkeypatch):
    import app.multi_agent.providers as module

    async def fake_acompletion(**kwargs):
        return fake_response(json.dumps({"steps": [
            {
                "id": "review",
                "role": "reviewer",
                "depends_on": [],
                "objective": "Review the supplied material",
                "expected_output": "Review notes",
            },
            {
                "id": "draft",
                "role": "writer",
                "depends_on": ["review"],
                "objective": "Write using the review notes",
                "expected_output": "Draft",
            },
        ]}))

    monkeypatch.setattr(module, "acompletion", fake_acompletion)
    provider = LiteLLMMultiAgentProvider()

    with pytest.raises(MultiAgentProviderError, match="invalid structured output"):
        await provider.plan(TaskRequest(prompt="Write and review a draft"))


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
        assert kwargs["response_format"] == {"type": "json_object"}
        assert kwargs["max_tokens"] == module.MAX_PROVIDER_REVIEW_OUTPUT_TOKENS
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
