"""Tests for test tool registry in the Relay AI service."""


import asyncio
import pytest

from pydantic import ValidationError

from app.agentops.contracts import InvestigationContext
from app.agentops.simulator import latency_spike_scenario
from app.agentops.tools.registry import (
    ToolArgumentError,
    ToolCallLimitExceeded,
    ToolExecutionError,
    ToolRegistry,
    UnknownToolError,
)


@pytest.fixture
def context():
    scenario = latency_spike_scenario()
    return InvestigationContext.model_validate({
        "scenario_id": scenario["scenario_id"],
        "service": scenario["service"],
        "signal": scenario["signal"],
        "evidence": scenario["evidence"],
    })


@pytest.mark.asyncio
async def test_registry_exposes_only_allowlisted_read_tools():
    registry = ToolRegistry()

    names = [
        item["function"]["name"]
        for item in registry.definitions()
    ]

    assert names == [
        "get_incident_details",
        "search_incident_evidence",
        "get_service_health",
    ]
    assert all(item["type"] == "function" for item in registry.definitions())


@pytest.mark.asyncio
async def test_incident_details_are_grounded_in_context(context):
    registry = ToolRegistry()

    result = await registry.execute("get_incident_details", {}, context)

    assert result["scenario_id"] == context.scenario_id
    assert result["service"] == context.service
    assert result["evidence_count"] == len(context.evidence)


@pytest.mark.asyncio
async def test_evidence_search_returns_matching_evidence(context):
    registry = ToolRegistry()

    result = await registry.execute(
        "search_incident_evidence",
        {"query": "connection pool", "limit": 3},
        context,
    )

    assert result["count"] >= 1
    assert any(
        "connection pool" in item["observation"].casefold()
        for item in result["evidence"]
    )


@pytest.mark.asyncio
async def test_evidence_search_respects_limit(context):
    registry = ToolRegistry()

    result = await registry.execute(
        "search_incident_evidence",
        {"query": "metric", "limit": 1},
        context,
    )

    assert len(result["evidence"]) <= 1


@pytest.mark.asyncio
async def test_service_health_is_explicitly_simulated(context):
    registry = ToolRegistry()

    result = await registry.execute(
        "get_service_health",
        {"service": "checkout-api"},
        context,
    )

    assert result["status"] == "degraded"
    assert result["environment"] == "simulator"


@pytest.mark.asyncio
async def test_unknown_service_is_rejected(context):
    registry = ToolRegistry()

    with pytest.raises(ToolExecutionError):
        await registry.execute(
            "get_service_health",
            {"service": "unrelated-service"},
            context,
        )


@pytest.mark.asyncio
async def test_unknown_tool_is_rejected(context):
    registry = ToolRegistry()

    with pytest.raises(UnknownToolError):
        await registry.execute("execute_shell_command", {}, context)


@pytest.mark.asyncio
async def test_malformed_arguments_are_rejected(context):
    registry = ToolRegistry()

    with pytest.raises(ToolArgumentError):
        await registry.execute(
            "search_incident_evidence",
            {"query": "x", "unexpected": True},
            context,
        )


@pytest.mark.asyncio
async def test_tool_call_budget_is_enforced(context):
    registry = ToolRegistry(max_calls=1)

    await registry.execute("get_incident_details", {}, context)

    with pytest.raises(ToolCallLimitExceeded):
        await registry.execute("get_service_health", {}, context)


def test_tool_call_budget_must_be_bounded():
    with pytest.raises(ValueError):
        ToolRegistry(max_calls=0)

    with pytest.raises(ValueError):
        ToolRegistry(max_calls=21)


def test_invalid_tool_arguments_are_not_accepted_by_schema():
    with pytest.raises(ValidationError):
        from app.agentops.tools.registry import EvidenceSearchArguments
        EvidenceSearchArguments(query="x", limit=100)


@pytest.mark.asyncio
async def test_tool_result_size_is_bounded(context):
    registry = ToolRegistry(max_result_bytes=128)
    registry._tools["get_incident_details"].handler = (
        lambda _context, _arguments: {"payload": "x" * 200}
    )

    with pytest.raises(ToolExecutionError, match="size limit"):
        await registry.execute("get_incident_details", {}, context)


def test_tool_result_limit_must_be_bounded():
    with pytest.raises(ValueError):
        ToolRegistry(max_result_bytes=0)

    with pytest.raises(ValueError):
        ToolRegistry(max_result_bytes=65_537)


def test_registry_exposes_only_explicitly_allowed_tools():
    registry = ToolRegistry(
        allowed_tools={"search_incident_evidence"},
    )

    names = {
        item["function"]["name"]
        for item in registry.definitions()
    }

    assert names == {"search_incident_evidence"}


def test_registry_rejects_execution_outside_role_allowlist():
    from app.agentops.tools.registry import UnknownToolError

    registry = ToolRegistry(
        allowed_tools={"search_incident_evidence"},
    )
    scenario = latency_spike_scenario()
    context = InvestigationContext.model_validate(
        {
            "scenario_id": scenario["scenario_id"],
            "service": scenario["service"],
            "signal": scenario["signal"],
            "evidence": scenario["evidence"],
        }
    )

    with pytest.raises(UnknownToolError, match="not allowlisted"):
        asyncio.run(
            registry.execute(
                "get_service_health",
                {},
                context,
            )
        )


def test_registry_rejects_unknown_names_in_role_allowlist():
    registry = ToolRegistry(
        allowed_tools={"execute_remediation"},
    )

    with pytest.raises(ValueError, match="unknown tool names"):
        registry.definitions()
