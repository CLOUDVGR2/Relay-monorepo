"""Validated, bounded, read-only tools for incident investigations."""

import json
from typing import Any, Callable

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.agentops.contracts import InvestigationContext


class ToolArguments(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class EmptyArguments(ToolArguments):
    pass


class EvidenceSearchArguments(ToolArguments):
    query: str = Field(min_length=2, max_length=200)
    limit: int = Field(default=5, ge=1, le=10)


class ServiceHealthArguments(ToolArguments):
    service: str | None = Field(default=None, min_length=1, max_length=200)


class ToolExecutionError(Exception):
    """Safe tool execution error."""


class UnknownToolError(ToolExecutionError):
    pass


class ToolCallLimitExceeded(ToolExecutionError):
    pass


class ToolArgumentError(ToolExecutionError):
    pass


class RegisteredTool:
    def __init__(
        self,
        name: str,
        description: str,
        arguments_model: type[ToolArguments],
        handler: Callable[[InvestigationContext, ToolArguments], dict[str, Any]],
    ):
        self.name = name
        self.description = description
        self.arguments_model = arguments_model
        self.handler = handler

    def definition(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.arguments_model.model_json_schema(),
            },
        }


def _incident_details(
    context: InvestigationContext, arguments: ToolArguments
) -> dict[str, Any]:
    return {
        "scenario_id": context.scenario_id,
        "service": context.service,
        "signal": context.signal.model_dump(),
        "evidence_count": len(context.evidence),
    }


def _search_evidence(
    context: InvestigationContext, arguments: ToolArguments
) -> dict[str, Any]:
    args = EvidenceSearchArguments.model_validate(arguments.model_dump())
    query = args.query.casefold()
    matches = []

    for evidence in context.evidence:
        searchable = " ".join(
            [
                evidence.id,
                evidence.type,
                evidence.source,
                evidence.observation,
                *evidence.supports,
            ]
        ).casefold()

        if query in searchable:
            matches.append(evidence.model_dump())

        if len(matches) >= args.limit:
            break

    return {
        "query": args.query,
        "count": len(matches),
        "evidence": matches,
    }


def _service_health(
    context: InvestigationContext, arguments: ToolArguments
) -> dict[str, Any]:
    args = ServiceHealthArguments.model_validate(arguments.model_dump())

    if args.service and args.service.casefold() != context.service.casefold():
        raise ToolExecutionError("Service is not available in this scenario")

    health_evidence = [
        item.model_dump()
        for item in context.evidence
        if item.type.casefold() == "health"
    ]

    return {
        "service": context.service,
        "status": (
            "degraded"
            if context.signal.observed_ms > context.signal.threshold_ms
            else "healthy"
        ),
        "metric": context.signal.metric,
        "observed_ms": context.signal.observed_ms,
        "threshold_ms": context.signal.threshold_ms,
        "environment": "simulator",
        "evidence": health_evidence,
    }


class ToolRegistry:
    """Allowlisted tool execution with schema validation and a call budget."""

    def __init__(
        self,
        max_calls: int = 5,
        max_result_bytes: int = 16_384,
        allowed_tools: set[str] | frozenset[str] | None = None,
    ):
        if max_calls < 1 or max_calls > 20:
            raise ValueError("max_calls must be between 1 and 20")
        if max_result_bytes < 1 or max_result_bytes > 65_536:
            raise ValueError("max_result_bytes must be between 1 and 65536")

        self.max_calls = max_calls
        self.max_result_bytes = max_result_bytes
        self.calls_made = 0
        self._tools: dict[str, RegisteredTool] = {}
        self._allowed_tools = (
            frozenset(allowed_tools) if allowed_tools is not None else None
        )

        self.register(
            RegisteredTool(
                "get_incident_details",
                "Read the current simulated incident summary and signal.",
                EmptyArguments,
                _incident_details,
            )
        )
        self.register(
            RegisteredTool(
                "search_incident_evidence",
                "Search the current incident's collected evidence.",
                EvidenceSearchArguments,
                _search_evidence,
            )
        )
        self.register(
            RegisteredTool(
                "get_service_health",
                "Read simulated health information for the incident service.",
                ServiceHealthArguments,
                _service_health,
            )
        )

    def register(self, tool: RegisteredTool) -> None:
        if tool.name in self._tools:
            raise ValueError("Tool name is already registered")
        self._tools[tool.name] = tool

    def definitions(self) -> list[dict[str, Any]]:
        if self._allowed_tools is None:
            tools = self._tools.values()
        else:
            unknown = self._allowed_tools - set(self._tools)
            if unknown:
                raise ValueError("Allowlist contains unknown tool names")
            tools = (
                tool
                for name, tool in self._tools.items()
                if name in self._allowed_tools
            )

        return [tool.definition() for tool in tools]

    async def execute(
        self,
        name: str,
        arguments: dict[str, Any],
        context: InvestigationContext,
    ) -> dict[str, Any]:
        if self.calls_made >= self.max_calls:
            raise ToolCallLimitExceeded("Tool call limit reached")

        self.calls_made += 1

        tool = self._tools.get(name)
        if (
            tool is None
            or (
                self._allowed_tools is not None
                and name not in self._allowed_tools
            )
        ):
            raise UnknownToolError("Tool is not allowlisted")

        try:
            validated_arguments = tool.arguments_model.model_validate(arguments)
        except (ValidationError, TypeError, ValueError) as exc:
            raise ToolArgumentError("Tool arguments are invalid") from exc

        try:
            result = tool.handler(context, validated_arguments)
        except ToolExecutionError:
            raise
        except Exception as exc:
            raise ToolExecutionError("Tool execution failed") from exc

        if not isinstance(result, dict):
            raise ToolExecutionError("Tool returned an invalid result")

        try:
            serialized = json.dumps(
                result,
                ensure_ascii=False,
                separators=(",", ":"),
                allow_nan=False,
            )
        except (TypeError, ValueError) as exc:
            raise ToolExecutionError(
                "Tool returned a non-serializable result"
            ) from exc

        if len(serialized.encode("utf-8")) > self.max_result_bytes:
            raise ToolExecutionError("Tool result exceeds size limit")

        return result
