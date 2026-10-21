"""Workflow module for the Relay AI service."""


import asyncio
import math
import time
import uuid
from contextvars import ContextVar
from typing import Any, Callable, TypedDict

from langgraph.graph import END, START, StateGraph

from app.agentops.agents import (
    DiagnosisAgent,
    EvidenceRetrievalAgent,
    InvestigationSupervisor,
    VerificationAgent,
)
from app.agentops.contracts import (
    Evidence,
    InvestigationContext,
    InvestigationResult,
)
from app.agentops.providers.base import InvestigationProvider


_active_trace: ContextVar[list[dict[str, Any]] | None] = ContextVar(
    "active_investigation_trace",
    default=None,
)


_trace_callback: ContextVar[
    Callable[[list[dict[str, Any]]], Any] | None
] = ContextVar("investigation_trace_callback", default=None)


async def _publish_trace(trace: list[dict[str, Any]]) -> None:
    callback = _trace_callback.get()
    if callback is not None:
        result = callback([record.copy() for record in trace])
        if asyncio.iscoroutine(result):
            await result


class InvestigationState(TypedDict, total=False):
    scenario: dict[str, Any]
    context: InvestigationContext
    collected_evidence: list[Evidence]
    raw_result: dict[str, Any]
    verified_result: InvestigationResult
    verification_passed: bool
    result: InvestigationResult


def _validate_timeout(timeout_seconds: float) -> None:
    if (
        isinstance(timeout_seconds, bool)
        or not isinstance(timeout_seconds, (int, float))
        or not math.isfinite(timeout_seconds)
        or not 1 <= timeout_seconds <= 120
    ):
        raise ValueError(
            "Investigation timeout must be between 1 and 120 seconds"
        )


def _build_nodes(provider: InvestigationProvider):
    evidence_role = EvidenceRetrievalAgent()
    diagnosis_role = DiagnosisAgent(provider)
    verification_role = VerificationAgent()
    supervisor_role = InvestigationSupervisor()

    async def prepare_context(
        state: InvestigationState,
    ) -> dict[str, Any]:
        scenario = state["scenario"]
        context = InvestigationContext.model_validate(
            {
                "scenario_id": scenario["scenario_id"],
                "service": scenario["service"],
                "signal": scenario["signal"],
                "evidence": scenario["evidence"],
            }
        )
        return {"context": context}

    async def evidence_agent(
        state: InvestigationState,
    ) -> dict[str, Any]:
        evidence = await evidence_role.retrieve(state["context"])
        return {"collected_evidence": evidence}

    async def diagnosis_agent(
        state: InvestigationState,
    ) -> dict[str, Any]:
        raw_result = await diagnosis_role.diagnose(
            state["context"],
            state["collected_evidence"],
        )
        return {"raw_result": raw_result}

    async def verification_agent(
        state: InvestigationState,
    ) -> dict[str, Any]:
        result = verification_role.verify(
            state["raw_result"],
            state["collected_evidence"],
        )
        return {
            "verified_result": result,
            "verification_passed": True,
        }

    async def supervisor(
        state: InvestigationState,
    ) -> dict[str, Any]:
        result = supervisor_role.accept(
            state.get("verified_result"),
            state.get("verification_passed") is True,
        )
        return {"result": result}

    return {
        "prepare_context": prepare_context,
        "evidence_agent": evidence_agent,
        "diagnosis_agent": diagnosis_agent,
        "verification_agent": verification_agent,
        "supervisor": supervisor,
    }


def _build_graph(provider: InvestigationProvider, trace=None):
    nodes = _build_nodes(provider)
    graph = StateGraph(InvestigationState)

    for name, node in nodes.items():
        if trace is None:
            graph.add_node(name, node)
            continue

        async def traced_node(
            state: InvestigationState,
            *,
            stage=node,
            stage_name=name,
        ) -> dict[str, Any]:
            started = time.perf_counter()
            record = {
                "stage": stage_name,
                "status": "running",
                "duration_ms": 0.0,
            }
            trace.append(record)
            await _publish_trace(trace)

            try:
                result = await stage(state)
                record["status"] = "completed"
            except Exception as exc:
                record["status"] = "failed"
                record["error_type"] = type(exc).__name__
                raise
            finally:
                record["duration_ms"] = round(
                    (time.perf_counter() - started) * 1000, 2
                )
                await _publish_trace(trace)

            return result

        graph.add_node(name, traced_node)

    graph.add_edge(START, "prepare_context")
    graph.add_edge("prepare_context", "evidence_agent")
    graph.add_edge("evidence_agent", "diagnosis_agent")
    graph.add_edge("diagnosis_agent", "verification_agent")
    graph.add_edge("verification_agent", "supervisor")
    graph.add_edge("supervisor", END)

    return graph.compile()


async def run_investigation_with_trace(
    scenario: dict[str, Any],
    provider: InvestigationProvider,
    timeout_seconds: float = 30.0,
) -> tuple[InvestigationResult, list[dict[str, Any]]]:
    _validate_timeout(timeout_seconds)

    run_id = str(uuid.uuid4())
    trace: list[dict[str, Any]] = []
    graph = _build_graph(provider, trace)

    try:
        state = await asyncio.wait_for(
            graph.ainvoke({"scenario": scenario}),
            timeout=timeout_seconds,
        )
    except asyncio.TimeoutError as exc:
        raise TimeoutError(
            "Investigation deadline exceeded"
        ) from exc
    finally:
        for record in trace:
            record["run_id"] = run_id

        collector = _active_trace.get()
        if collector is not None:
            collector.extend(trace)

    return state["result"], trace


async def run_investigation(
    scenario: dict[str, Any],
    provider: InvestigationProvider,
    timeout_seconds: float = 30.0,
) -> InvestigationResult:
    result, _trace = await run_investigation_with_trace(
        scenario,
        provider,
        timeout_seconds,
    )
    return result
