"""Mcp adapter module for the Relay AI service."""


from __future__ import annotations

import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager
from typing import Any, Callable, Literal

import httpx2

from jsonschema import Draft202012Validator
from mcp import Client
from mcp.client.streamable_http import streamable_http_client
from mcp.shared._httpx_utils import create_mcp_http_client
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


class MCPAdapterError(RuntimeError):
    """Safe, bounded MCP adapter failure."""


class MCPToolPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str = Field(
        min_length=1,
        max_length=128,
        pattern=r"^[a-zA-Z0-9_-]+$",
    )
    input_schema: dict[str, Any]
    permission: Literal["read"] = "read"


class MCPServerConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    url: HttpUrl
    auth_token: str | None = Field(default=None, repr=False)
    allowed_tools: tuple[MCPToolPolicy, ...] = Field(
        min_length=1,
        max_length=20,
    )
    timeout_seconds: float = Field(default=10, ge=1, le=30)
    max_result_bytes: int = Field(default=16384, ge=128, le=65536)

    @field_validator("url")
    @classmethod
    def require_secure_transport(cls, value: HttpUrl) -> HttpUrl:
        if value.scheme != "https":
            host = value.host or ""
            if value.scheme != "http" or host not in {
                "localhost",
                "127.0.0.1",
                "::1",
            }:
                raise ValueError(
                    "MCP servers must use HTTPS outside localhost"
                )
        if value.username or value.password:
            raise ValueError("Credentials must not be embedded in MCP URLs")
        return value

    @field_validator("allowed_tools")
    @classmethod
    def require_unique_tool_names(
        cls, value: tuple[MCPToolPolicy, ...]
    ) -> tuple[MCPToolPolicy, ...]:
        names = [item.name for item in value]
        if len(names) != len(set(names)):
            raise ValueError("MCP tool names must be unique")
        return value


class MCPToolAdapter:
    """Allowlisted MCP tools for trusted servers reviewed for read-only behavior.

    An allowlist and schema validation constrain calls but cannot guarantee
    that a remote tool has no side effects.
    """

    def __init__(
        self,
        config: MCPServerConfig,
        client_factory: Callable[..., Any] | None = None,
        audit_sink: Callable[[dict[str, Any]], None] | None = None,
    ) -> None:
        self._config = config
        self._client_factory = client_factory or _default_client_factory
        self._audit_sink = audit_sink
        self._policies = {tool.name: tool for tool in config.allowed_tools}

        for policy in config.allowed_tools:
            try:
                Draft202012Validator.check_schema(policy.input_schema)
            except Exception as exc:
                raise ValueError(
                    f"Invalid configured schema for MCP tool {policy.name}"
                ) from exc

            if policy.input_schema.get("type") != "object":
                raise ValueError("MCP tool schemas must have an object root")

    async def definitions(self) -> list[dict[str, Any]]:
        started = time.monotonic()
        outcome = "error"
        error_code = "remote_failure"

        try:
            async with asyncio.timeout(self._config.timeout_seconds):
                async with self._session() as client:
                    remote_tools = await self._list_remote_tools(client)
                    definitions = self._definitions_from(remote_tools)

            outcome = "success"
            error_code = None
            return definitions

        except MCPAdapterError as exc:
            error_messages = {
                "Remote MCP operation timed out": "timeout",
                "An allowlisted MCP tool is unavailable": "tool_unavailable",
                "Remote MCP tool schema does not match configured policy": "schema_mismatch",
                "Unable to connect to remote MCP server": "connection_failure",
            }
            error_code = error_messages.get(str(exc), "remote_failure")
            raise

        except TimeoutError as exc:
            error_code = "timeout"
            raise MCPAdapterError(
                "Remote MCP operation timed out"
            ) from exc

        except Exception as exc:
            error_code = "remote_failure"
            raise MCPAdapterError(
                "Remote MCP operation failed"
            ) from exc

        finally:
            self._emit_audit({
                "event": "mcp.discovery",
                "tool_name": "<discovery>",
                "outcome": outcome,
                "error_code": error_code,
                "duration_ms": round(
                    (time.monotonic() - started) * 1000
                ),
            })

    async def execute(
        self, name: str, arguments: dict[str, Any]
    ) -> dict[str, Any]:
        started = time.monotonic()
        outcome = "error"
        error_code = "remote_failure"

        try:
            policy = self._policies.get(name)
            if policy is None:
                outcome = "denied"
                error_code = "tool_not_allowlisted"
                raise MCPAdapterError("MCP tool is not allowlisted")

            if not isinstance(arguments, dict):
                outcome = "denied"
                error_code = "invalid_arguments"
                raise MCPAdapterError(
                    "MCP tool arguments must be an object"
                )

            try:
                Draft202012Validator(
                    policy.input_schema
                ).validate(arguments)
            except Exception as exc:
                outcome = "denied"
                error_code = "invalid_arguments"
                raise MCPAdapterError(
                    "MCP tool arguments failed validation"
                ) from exc

            try:
                async with asyncio.timeout(self._config.timeout_seconds):
                    async with self._session() as client:
                        remote_tools = await self._list_remote_tools(client)
                        self._verify_remote_tool(name, remote_tools)
                        result = await client.call_tool(
                            name,
                            arguments,
                            read_timeout_seconds=self._config.timeout_seconds,
                        )

                    if getattr(result, "is_error", False):
                        raise MCPAdapterError(
                            "Remote MCP tool reported an error"
                        )

                    structured = getattr(
                        result, "structured_content", None
                    )
                    if structured is not None:
                        payload: Any = structured
                    else:
                        content = getattr(result, "content", [])
                        payload = {
                            "content": [
                                item.model_dump(mode="json")
                                if hasattr(item, "model_dump")
                                else str(item)
                                for item in content
                            ]
                        }

                    if not isinstance(payload, dict):
                        payload = {"result": payload}

                    encoded = json.dumps(
                        payload,
                        ensure_ascii=False,
                        separators=(",", ":"),
                        allow_nan=False,
                    ).encode("utf-8")

                    if len(encoded) > self._config.max_result_bytes:
                        raise MCPAdapterError(
                            "Remote MCP result exceeds size limit"
                        )

                    outcome = "success"
                    error_code = None
                    return payload

            except MCPAdapterError as exc:
                error_messages = {
                    "Remote MCP operation timed out": "timeout",
                    "An allowlisted MCP tool is unavailable": "tool_unavailable",
                    "Remote MCP tool schema does not match configured policy": "schema_mismatch",
                    "Remote MCP tool reported an error": "remote_tool_error",
                    "Remote MCP result exceeds size limit": "result_too_large",
                    "Remote MCP operation failed": "remote_failure",
                    "Unable to connect to remote MCP server": "connection_failure",
                }
                error_code = error_messages.get(str(exc), "remote_failure")
                raise
            except TimeoutError as exc:
                error_code = "timeout"
                raise MCPAdapterError(
                    "Remote MCP operation timed out"
                ) from exc
            except Exception as exc:
                error_code = "remote_failure"
                raise MCPAdapterError(
                    "Remote MCP operation failed"
                ) from exc
        finally:
            self._emit_audit({
                "event": "mcp.tool",
                "tool_name": name[:128] if isinstance(name, str) else "<invalid>",
                "outcome": outcome,
                "error_code": error_code,
                "duration_ms": round((time.monotonic() - started) * 1000),
            })

    def _emit_audit(self, event: dict[str, Any]) -> None:
        try:
            if self._audit_sink is not None:
                self._audit_sink(event)
            else:
                logging.getLogger(__name__).info(
                    "mcp_tool_audit %s",
                    json.dumps(event, sort_keys=True, separators=(",", ":")),
                )
        except Exception:
            # Auditing must never change tool execution or error behavior.
            pass

    def _session(self):
        return _BoundedSession(
            self._client_factory,
            str(self._config.url),
            self._config.timeout_seconds,
            self._config.auth_token,
        )

    async def _list_remote_tools(
        self, client: Any
    ) -> dict[str, Any]:
        result = await client.list_tools()
        return {
            tool.name: tool
            for tool in result.tools
            if getattr(tool, "name", None) in self._policies
        }

    def _verify_remote_tool(
        self, name: str, remote_tools: dict[str, Any]
    ) -> Any:
        policy = self._policies.get(name)
        remote = remote_tools.get(name)

        if policy is None or remote is None:
            raise MCPAdapterError("An allowlisted MCP tool is unavailable")

        remote_schema = getattr(remote, "input_schema", None)
        if remote_schema is None:
            remote_schema = getattr(remote, "inputSchema", None)

        if self._canonical(remote_schema) != self._canonical(
            policy.input_schema
        ):
            raise MCPAdapterError(
                "Remote MCP tool schema does not match configured policy"
            )

        return remote

    def _definitions_from(
        self, remote_tools: dict[str, Any]
    ) -> list[dict[str, Any]]:
        definitions: list[dict[str, Any]] = []

        for name, policy in self._policies.items():
            remote = self._verify_remote_tool(name, remote_tools)
            definitions.append({
                "type": "function",
                "function": {
                    "name": name,
                    "description": (
                        getattr(remote, "description", None) or ""
                    )[:1000],
                    "parameters": policy.input_schema,
                },
            })

        return definitions

    @staticmethod
    def _canonical(value: Any) -> str:
        return json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        )


@asynccontextmanager
async def _default_client_factory(
    url: str,
    *,
    read_timeout_seconds: float | None = None,
    auth_token: str | None = None,
):
    timeout_seconds = read_timeout_seconds or 10
    headers = (
        {"Authorization": f"Bearer {auth_token}"}
        if auth_token
        else None
    )

    async with create_mcp_http_client(
        headers=headers,
        timeout=httpx2.Timeout(timeout_seconds),
    ) as http_client:
        transport = streamable_http_client(
            url,
            http_client=http_client,
        )
        async with Client(
            transport,
            read_timeout_seconds=read_timeout_seconds,
        ) as client:
            yield client


class _BoundedSession:
    def __init__(
        self,
        client_factory: Callable[..., Any],
        url: str,
        timeout_seconds: float,
        auth_token: str | None = None,
    ) -> None:
        self._client_factory = client_factory
        self._url = url
        self._timeout_seconds = timeout_seconds
        self._auth_token = auth_token
        self._client_context: Any = None
        self.client: Any = None

    async def __aenter__(self):
        try:
            kwargs = {
                "read_timeout_seconds": self._timeout_seconds,
            }
            if self._auth_token:
                kwargs["auth_token"] = self._auth_token

            async with asyncio.timeout(self._timeout_seconds):
                self._client_context = self._client_factory(
                    self._url,
                    **kwargs,
                )
                self.client = await self._client_context.__aenter__()
            return self.client
        except TimeoutError as exc:
            raise MCPAdapterError(
                "Remote MCP operation timed out"
            ) from exc
        except MCPAdapterError:
            raise
        except Exception as exc:
            raise MCPAdapterError(
                "Unable to connect to remote MCP server"
            ) from exc

    async def __aexit__(self, exc_type, exc, tb):
        if self._client_context is not None:
            try:
                async with asyncio.timeout(self._timeout_seconds):
                    return await self._client_context.__aexit__(
                        exc_type, exc, tb
                    )
            except TimeoutError as error:
                raise MCPAdapterError(
                    "Remote MCP operation timed out"
                ) from error
            except MCPAdapterError:
                raise
            except Exception as error:
                raise MCPAdapterError(
                    "Remote MCP operation failed"
                ) from error
        return False
