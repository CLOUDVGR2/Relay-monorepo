"""Tests for test mcp provider config in the Relay AI service."""


import pytest

from app.agentops.providers.litellm_provider import (
    LiteLLMInvestigationProvider,
)
from app.agentops.tools.mcp_adapter import MCPToolAdapter


SCHEMA = {
    "type": "object",
    "properties": {"query": {"type": "string", "minLength": 2}},
    "required": ["query"],
    "additionalProperties": False,
}


def test_mcp_is_disabled_by_default(monkeypatch):
    monkeypatch.delenv("MCP_ENABLED", raising=False)
    monkeypatch.delenv("MCP_SERVER_URL", raising=False)
    monkeypatch.delenv("MCP_ALLOWED_TOOLS", raising=False)

    provider = LiteLLMInvestigationProvider()

    assert provider.mcp_adapter is None


def test_mcp_enabled_requires_server_and_allowlist(monkeypatch):
    monkeypatch.setenv("MCP_ENABLED", "true")
    monkeypatch.delenv("MCP_SERVER_URL", raising=False)
    monkeypatch.delenv("MCP_ALLOWED_TOOLS", raising=False)

    with pytest.raises(ValueError, match="MCP requires"):
        LiteLLMInvestigationProvider()


def test_mcp_enabled_builds_configured_adapter(monkeypatch):
    monkeypatch.setenv("MCP_ENABLED", "true")
    monkeypatch.setenv("MCP_SERVER_URL", "https://mcp.example.com/mcp")
    monkeypatch.setenv(
        "MCP_ALLOWED_TOOLS",
        '{"search_records": '
        '{"type":"object","properties":{"query":{"type":"string",'
        '"minLength":2}},"required":["query"],"additionalProperties":false}}',
    )

    provider = LiteLLMInvestigationProvider()

    assert isinstance(provider.mcp_adapter, MCPToolAdapter)
    assert set(provider.mcp_adapter._policies) == {"search_records"}


def test_mcp_enabled_rejects_invalid_configuration(monkeypatch):
    monkeypatch.setenv("MCP_ENABLED", "true")
    monkeypatch.setenv("MCP_SERVER_URL", "http://mcp.example.com/mcp")
    monkeypatch.setenv("MCP_ALLOWED_TOOLS", '{"search_records": {}}')

    with pytest.raises(ValueError, match="MCP configuration is invalid"):
        LiteLLMInvestigationProvider()


def test_mcp_auth_token_is_passed_to_config_without_exposure(monkeypatch):
    monkeypatch.setenv("MCP_ENABLED", "true")
    monkeypatch.setenv("MCP_SERVER_URL", "https://mcp.example.com/mcp")
    monkeypatch.setenv(
        "MCP_ALLOWED_TOOLS",
        '{"search_records": {"type": "object", "properties": {}, '
        '"additionalProperties": false}}',
    )
    monkeypatch.setenv("MCP_AUTH_TOKEN", "test-secret-token")

    provider = LiteLLMInvestigationProvider()

    assert provider.mcp_adapter is not None
    assert provider.mcp_adapter._config.auth_token == "test-secret-token"
    assert "test-secret-token" not in repr(provider.mcp_adapter._config)


@pytest.mark.parametrize(
    "raw_allowlist",
    [
        "not-json",
        "[]",
        "null",
        "{}",
        '{"search_records": {}}',
        '{"search_records": {"type": "string"}}',
    ],
)
def test_mcp_rejects_invalid_allowlist_formats_and_schemas(
    monkeypatch, raw_allowlist
):
    monkeypatch.setenv("MCP_ENABLED", "true")
    monkeypatch.setenv("MCP_SERVER_URL", "https://mcp.example.com/mcp")
    monkeypatch.setenv("MCP_ALLOWED_TOOLS", raw_allowlist)
    monkeypatch.setenv("MCP_AUTH_TOKEN", "test-secret-token")

    with pytest.raises(ValueError, match="MCP configuration is invalid") as error:
        LiteLLMInvestigationProvider()

    assert "test-secret-token" not in str(error.value)
    assert "not-json" not in str(error.value)
