"""Tests for test litellm tool calls in the Relay AI service."""


import json
from types import SimpleNamespace

import pytest

from app.agentops.contracts import InvestigationContext
from app.agentops.providers import litellm_provider
from app.agentops.providers.litellm_provider import (
    InvestigationProviderError,
    LiteLLMInvestigationProvider,
)
from app.agentops.simulator import latency_spike_scenario


@pytest.fixture
def context():
    scenario = latency_spike_scenario()
    return InvestigationContext.model_validate({
        "scenario_id": scenario["scenario_id"],
        "service": scenario["service"],
        "signal": scenario["signal"],
        "evidence": scenario["evidence"],
    })


@pytest.fixture
def valid_result():
    return {
        "summary": "The evidence indicates elevated database pool pressure.",
        "hypotheses": [{
            "id": "database_pool_exhaustion",
            "summary": "Database connection pool exhaustion",
            "confidence": 0.9,
            "evidence_ids": ["metric-001", "log-001"],
        }],
        "proposed_action": {
            "action_id": "simulate_pool_recovery",
            "description": "Simulate pool recovery",
            "risk": "low",
            "execution_environment": "simulator",
        },
        "limitations": ["This is a simulator investigation."],
    }


def response(message):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=message)]
    )


def tool_call(name, arguments, call_id="call-1"):
    return SimpleNamespace(
        id=call_id,
        function=SimpleNamespace(
            name=name,
            arguments=json.dumps(arguments),
        ),
    )


@pytest.mark.asyncio
async def test_provider_executes_approved_tool_then_returns_result(
    monkeypatch, context, valid_result
):
    requests = []

    async def fake_acompletion(**kwargs):
        requests.append(kwargs)

        if len(requests) == 1:
            return response(SimpleNamespace(
                content=None,
                tool_calls=[
                    tool_call("get_incident_details", {}),
                ],
            ))

        tool_messages = [
            message for message in kwargs["messages"]
            if message["role"] == "tool"
        ]
        assert tool_messages, "Tool result must reach the follow-up request"

        tool_result = json.loads(tool_messages[-1]["content"])
        assert tool_result["ok"] is True
        assert tool_result["result"]["scenario_id"] == context.scenario_id

        assert kwargs["response_format"].__name__ == "InvestigationResult"
        return response(SimpleNamespace(
            content=json.dumps(valid_result),
            tool_calls=None,
        ))

    monkeypatch.setattr(
        litellm_provider, "acompletion", fake_acompletion
    )

    provider = LiteLLMInvestigationProvider(model="openai/test-model")
    result = await provider.investigate(context)

    assert result["summary"] == valid_result["summary"]
    assert len(requests) == 2
    assert requests[0]["tools"]
    assert requests[0]["tool_choice"] == "auto"
    assert requests[0]["temperature"] == 0
    assert requests[1]["temperature"] == 0
    assert "response_format" not in requests[0]
    assert requests[1]["response_format"].__name__ == "InvestigationResult"


@pytest.mark.asyncio
async def test_unknown_tool_is_rejected_without_execution(
    monkeypatch, context, valid_result
):
    requests = []

    async def fake_acompletion(**kwargs):
        requests.append(kwargs)

        if len(requests) == 1:
            return response(SimpleNamespace(
                content=None,
                tool_calls=[
                    tool_call("execute_shell_command", {"command": "id"}),
                ],
            ))

        tool_messages = [
            message for message in kwargs["messages"]
            if message["role"] == "tool"
        ]
        assert json.loads(tool_messages[-1]["content"])["ok"] is False

        return response(SimpleNamespace(
            content=json.dumps(valid_result),
            tool_calls=None,
        ))

    monkeypatch.setattr(
        litellm_provider, "acompletion", fake_acompletion
    )

    result = await LiteLLMInvestigationProvider(
        model="openai/test-model"
    ).investigate(context)

    assert result["proposed_action"]["execution_environment"] == "simulator"


@pytest.mark.asyncio
async def test_invalid_tool_json_is_rejected_and_sanitized(
    monkeypatch, context, valid_result
):
    async def fake_acompletion(**kwargs):
        if not any(
            message["role"] == "tool" for message in kwargs["messages"]
        ):
            return response(SimpleNamespace(
                content=None,
                tool_calls=[SimpleNamespace(
                    id="call-bad",
                    function=SimpleNamespace(
                        name="search_incident_evidence",
                        arguments="{not-json",
                    ),
                )],
            ))

        tool_message = [
            message for message in kwargs["messages"]
            if message["role"] == "tool"
        ][-1]
        assert json.loads(tool_message["content"])["ok"] is False

        return response(SimpleNamespace(
            content=json.dumps(valid_result),
            tool_calls=None,
        ))

    monkeypatch.setattr(
        litellm_provider, "acompletion", fake_acompletion
    )

    result = await LiteLLMInvestigationProvider(
        model="openai/test-model"
    ).investigate(context)

    assert result["summary"] == valid_result["summary"]


@pytest.mark.asyncio
async def test_tool_round_limit_is_enforced(monkeypatch, context):
    async def fake_acompletion(**kwargs):
        return response(SimpleNamespace(
            content=None,
            tool_calls=[tool_call("get_incident_details", {})],
        ))

    monkeypatch.setattr(
        litellm_provider, "acompletion", fake_acompletion
    )

    provider = LiteLLMInvestigationProvider(
        model="openai/test-model",
        max_tool_rounds=1,
    )

    with pytest.raises(
        InvestigationProviderError,
        match="round limit",
    ):
        await provider.investigate(context)


@pytest.mark.asyncio
async def test_provider_errors_do_not_expose_sensitive_details(
    monkeypatch, context
):
    async def fake_acompletion(**kwargs):
        raise RuntimeError("private provider credentials")

    monkeypatch.setattr(
        litellm_provider, "acompletion", fake_acompletion
    )

    with pytest.raises(InvestigationProviderError) as error:
        await LiteLLMInvestigationProvider(
            model="openai/test-model"
        ).investigate(context)

    assert "private provider credentials" not in str(error.value)


def test_provider_rejects_unbounded_tool_rounds():
    with pytest.raises(ValueError):
        LiteLLMInvestigationProvider(max_tool_rounds=6)


@pytest.mark.asyncio
async def test_tool_budget_is_enforced_within_one_response_batch(
    monkeypatch, context, valid_result
):
    requests = []

    async def fake_acompletion(**kwargs):
        requests.append(kwargs)

        if len(requests) == 1:
            return response(SimpleNamespace(
                content=None,
                tool_calls=[
                    tool_call("get_incident_details", {}, "call-1"),
                    tool_call("get_service_health", {}, "call-2"),
                ],
            ))

        tool_messages = [
            message for message in kwargs["messages"]
            if message["role"] == "tool"
        ]
        results = [
            json.loads(message["content"]) for message in tool_messages
        ]
        assert len(results) == 2
        assert results[0]["ok"] is True
        assert results[1]["ok"] is False

        return response(SimpleNamespace(
            content=json.dumps(valid_result),
            tool_calls=None,
        ))

    monkeypatch.setattr(
        litellm_provider, "acompletion", fake_acompletion
    )

    result = await LiteLLMInvestigationProvider(
        model="openai/test-model",
        max_tool_calls=1,
    ).investigate(context)

    assert result["summary"] == valid_result["summary"]
    assert len(requests) == 2


@pytest.mark.asyncio
async def test_provider_routes_allowlisted_tool_calls_to_mcp(
    monkeypatch, context, valid_result
):
    requests = []
    executed_calls = []

    class FakeMCPAdapter:
        async def definitions(self):
            return [{
                "type": "function",
                "function": {
                    "name": "search_records",
                    "description": "Search approved records",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"}
                        },
                        "required": ["query"],
                        "additionalProperties": False,
                    },
                },
            }]

        async def execute(self, name, arguments):
            executed_calls.append((name, arguments))
            return {"matches": ["approved-record-1"]}

    async def fake_acompletion(**kwargs):
        requests.append(kwargs)

        if len(requests) == 1:
            advertised_names = {
                item["function"]["name"]
                for item in kwargs["tools"]
            }
            assert "search_records" in advertised_names

            return response(SimpleNamespace(
                content=None,
                tool_calls=[
                    tool_call(
                        "search_records",
                        {"query": "database latency"},
                        "mcp-call-1",
                    ),
                ],
            ))

        tool_messages = [
            message for message in kwargs["messages"]
            if message["role"] == "tool"
        ]
        assert len(tool_messages) == 1
        assert json.loads(tool_messages[0]["content"]) == {
            "ok": True,
            "result": {"matches": ["approved-record-1"]},
        }

        return response(SimpleNamespace(
            content=json.dumps(valid_result),
            tool_calls=None,
        ))

    monkeypatch.setattr(
        litellm_provider, "acompletion", fake_acompletion
    )

    provider = LiteLLMInvestigationProvider(
        model="openai/test-model"
    )
    provider.mcp_adapter = FakeMCPAdapter()

    result = await provider.investigate(context)

    assert result["summary"] == valid_result["summary"]
    assert executed_calls == [
        ("search_records", {"query": "database latency"})
    ]
    assert len(requests) == 2


@pytest.mark.asyncio
async def test_invalid_tool_arguments_are_rejected_and_sanitized(
    monkeypatch, context, valid_result
):
    requests = []

    async def fake_acompletion(**kwargs):
        requests.append(kwargs)

        if len(requests) == 1:
            return response(SimpleNamespace(
                content=None,
                tool_calls=[
                    tool_call(
                        "get_incident_details",
                        {"signal": {"metric": "unexpected"}},
                    ),
                ],
            ))

        tool_messages = [
            message for message in kwargs["messages"]
            if message["role"] == "tool"
        ]
        assert tool_messages

        rejected = json.loads(tool_messages[-1]["content"])
        assert rejected["ok"] is False
        assert rejected["error"] == (
            "Tool request rejected or failed. "
            "Use only available tools and valid arguments."
        )
        assert "unexpected" not in rejected["error"]

        return response(SimpleNamespace(
            content=json.dumps(valid_result),
            tool_calls=None,
        ))

    monkeypatch.setattr(
        litellm_provider, "acompletion", fake_acompletion
    )

    result = await LiteLLMInvestigationProvider(
        model="openai/test-model"
    ).investigate(context)

    assert result["summary"] == valid_result["summary"]
    assert len(requests) == 2


@pytest.mark.asyncio
async def test_mcp_discovery_failure_does_not_expose_sensitive_details(
    monkeypatch, context
):
    class BrokenMCPAdapter:
        async def definitions(self):
            raise litellm_provider.MCPAdapterError(
                "private endpoint credentials and connection details"
            )

    async def unexpected_completion(**kwargs):
        raise AssertionError(
            "LLM must not be called when MCP discovery fails"
        )

    monkeypatch.setattr(
        litellm_provider, "acompletion", unexpected_completion
    )

    provider = LiteLLMInvestigationProvider(model="openai/test-model")
    provider.mcp_adapter = BrokenMCPAdapter()

    with pytest.raises(InvestigationProviderError) as error:
        await provider.investigate(context)

    assert "private endpoint credentials" not in str(error.value)
    assert "connection details" not in str(error.value)
    assert str(error.value) == (
        "LLM investigation request failed or returned invalid output"
    )


@pytest.mark.asyncio
async def test_provider_hides_and_rejects_unauthorized_remote_tools(
    monkeypatch, context, valid_result
):
    requests = []
    executed_calls = []

    class FakeMCPAdapter:
        async def definitions(self):
            return [
                {
                    "type": "function",
                    "function": {
                        "name": "search_records",
                        "description": "Search approved records",
                        "parameters": {
                            "type": "object",
                            "properties": {"query": {"type": "string"}},
                            "required": ["query"],
                            "additionalProperties": False,
                        },
                    },
                },
                {
                    "type": "function",
                    "function": {
                        "name": "delete_records",
                        "description": "Delete records",
                        "parameters": {
                            "type": "object",
                            "properties": {},
                            "additionalProperties": False,
                        },
                    },
                },
            ]

        async def execute(self, name, arguments):
            executed_calls.append((name, arguments))
            return {"unexpected": "execution"}

    async def fake_acompletion(**kwargs):
        requests.append(kwargs)

        if len(requests) == 1:
            advertised_names = {
                item["function"]["name"] for item in kwargs["tools"]
            }
            assert "search_records" in advertised_names
            assert "delete_records" not in advertised_names

            return response(SimpleNamespace(
                content=None,
                tool_calls=[
                    tool_call("delete_records", {}, "unauthorized-call"),
                ],
            ))

        tool_messages = [
            message for message in kwargs["messages"]
            if message["role"] == "tool"
        ]
        assert len(tool_messages) == 1
        rejected = json.loads(tool_messages[0]["content"])
        assert rejected["ok"] is False

        return response(SimpleNamespace(
            content=json.dumps(valid_result),
            tool_calls=None,
        ))

    monkeypatch.setattr(
        litellm_provider, "acompletion", fake_acompletion
    )

    provider = LiteLLMInvestigationProvider(model="openai/test-model")
    provider.mcp_adapter = FakeMCPAdapter()

    result = await provider.investigate(context)

    assert result["summary"] == valid_result["summary"]
    assert executed_calls == []
    assert len(requests) == 2
