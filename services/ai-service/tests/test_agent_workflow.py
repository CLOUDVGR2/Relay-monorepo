"""Tests for test agent workflow in the Relay AI service."""


import asyncio

import pytest
from pydantic import ValidationError

from app.agentops.agents import (
    DIAGNOSIS_ALLOWED_TOOLS,
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
from app.agentops.providers.mock import MockInvestigationProvider
from app.agentops.simulator import latency_spike_scenario
from app.agentops.workflow import (
    _active_trace,
    run_investigation,
    run_investigation_with_trace,
)


def test_mock_provider_returns_valid_grounded_investigation():
    result = asyncio.run(
        run_investigation(
            latency_spike_scenario(),
            MockInvestigationProvider(),
        )
    )

    evidence_ids = {
        item["id"] for item in latency_spike_scenario()["evidence"]
    }

    assert result.hypotheses
    assert all(
        set(hypothesis.evidence_ids).issubset(evidence_ids)
        for hypothesis in result.hypotheses
    )
    assert result.proposed_action.action_id == "simulate_pool_recovery"
    assert result.proposed_action.execution_environment == "simulator"
    assert any("mock" in item.lower() for item in result.limitations)


def test_workflow_rejects_unknown_evidence_reference():
    class InvalidProvider:
        name = "invalid"

        async def investigate(self, context):
            return {
                "summary": "Unsupported diagnosis",
                "hypotheses": [{
                    "id": "unknown_cause",
                    "summary": "Cause based on missing evidence",
                    "confidence": 0.9,
                    "evidence_ids": ["evidence-that-does-not-exist"],
                }],
                "proposed_action": {
                    "action_id": "simulate_pool_recovery",
                    "description": "Simulator-only action",
                    "risk": "low",
                    "execution_environment": "simulator",
                },
                "limitations": [],
            }

    with pytest.raises(
        ValueError,
        match="evidence that was not collected",
    ):
        asyncio.run(
            run_investigation(
                latency_spike_scenario(),
                InvalidProvider(),
            )
        )


def test_workflow_rejects_unsupported_remediation_action():
    class UnsafeProvider:
        name = "unsafe"

        async def investigate(self, context):
            return {
                "summary": "Try an unapproved action",
                "hypotheses": [{
                    "id": "database_pool_exhaustion",
                    "summary": "Possible database pool exhaustion",
                    "confidence": 0.8,
                    "evidence_ids": ["metric-001"],
                }],
                "proposed_action": {
                    "action_id": "run_shell_command",
                    "description": "Run a command",
                    "risk": "high",
                    "execution_environment": "simulator",
                },
                "limitations": [],
            }

    with pytest.raises(ValidationError):
        asyncio.run(
            run_investigation(
                latency_spike_scenario(),
                UnsafeProvider(),
            )
        )


def test_contract_rejects_confidence_outside_range():
    with pytest.raises(ValidationError):
        InvestigationResult.model_validate({
            "summary": "Invalid confidence test",
            "hypotheses": [{
                "id": "test",
                "summary": "Test hypothesis",
                "confidence": 1.5,
                "evidence_ids": ["metric-001"],
            }],
            "proposed_action": {
                "action_id": "simulate_pool_recovery",
                "description": "Simulator-only action",
                "risk": "low",
                "execution_environment": "simulator",
            },
            "limitations": [],
        })


def test_workflow_rejects_hypothesis_without_supporting_evidence():
    class UnsupportedProvider:
        name = "unsupported"

        async def investigate(self, context):
            return {
                "summary": "Unverified diagnosis",
                "hypotheses": [{
                    "id": "unrelated_failure",
                    "summary": "An unrelated failure caused the incident",
                    "confidence": 0.9,
                    "evidence_ids": ["metric-001"],
                }],
                "proposed_action": {
                    "action_id": "simulate_pool_recovery",
                    "description": "Simulator-only action",
                    "risk": "low",
                    "execution_environment": "simulator",
                },
                "limitations": [],
            }

    with pytest.raises(
        ValueError,
        match="not supported by its cited evidence",
    ):
        asyncio.run(
            run_investigation(
                latency_spike_scenario(),
                UnsupportedProvider(),
            )
        )


def test_workflow_accepts_hypothesis_with_matching_support_signal():
    result = asyncio.run(
        run_investigation(
            latency_spike_scenario(),
            MockInvestigationProvider(),
        )
    )

    evidence_by_id = {
        item["id"]: item
        for item in latency_spike_scenario()["evidence"]
    }

    for hypothesis in result.hypotheses:
        assert any(
            hypothesis.id in evidence_by_id[evidence_id]["supports"]
            for evidence_id in hypothesis.evidence_ids
        )


def test_workflow_enforces_investigation_deadline():
    class SlowProvider:
        name = "slow"

        async def investigate(self, context):
            await asyncio.sleep(2)
            raise AssertionError("Provider should be cancelled by deadline")

    with pytest.raises(TimeoutError, match="Investigation deadline exceeded"):
        asyncio.run(
            run_investigation(
                latency_spike_scenario(),
                SlowProvider(),
                timeout_seconds=1,
            )
        )


@pytest.mark.parametrize("timeout_seconds", [0, -1, 121, float("inf"), float("nan"), True])
def test_workflow_rejects_invalid_investigation_deadlines(timeout_seconds):
    with pytest.raises(ValueError, match="between 1 and 120 seconds"):
        asyncio.run(
            run_investigation(
                latency_spike_scenario(),
                MockInvestigationProvider(),
                timeout_seconds=timeout_seconds,
            )
        )


def _role_test_context():
    scenario = latency_spike_scenario()
    return InvestigationContext.model_validate({
        "scenario_id": scenario["scenario_id"],
        "service": scenario["service"],
        "signal": scenario["signal"],
        "evidence": scenario["evidence"],
    })


def _role_test_evidence():
    return [
        Evidence(
            id="role-evidence-1",
            type="metric",
            source="test",
            observation="Connection pool saturation observed",
            supports=["pool_exhaustion"],
        )
    ]


def _role_test_result():
    return {
        "summary": "The incident may be caused by pool exhaustion.",
        "hypotheses": [{
            "id": "pool_exhaustion",
            "summary": "Connection pool exhaustion caused the incident.",
            "confidence": 0.8,
            "evidence_ids": ["role-evidence-1"],
        }],
        "proposed_action": {
            "action_id": "simulate_pool_recovery",
            "description": "Simulate connection pool recovery.",
            "risk": "low",
            "execution_environment": "simulator",
        },
        "limitations": ["Test-only evidence."],
    }


def test_role_components_have_explicit_tool_boundaries():
    assert DIAGNOSIS_ALLOWED_TOOLS == frozenset({
        "get_incident_details",
        "search_incident_evidence",
        "get_service_health",
    })
    assert DiagnosisAgent(MockInvestigationProvider()).allowed_tools == (
        DIAGNOSIS_ALLOWED_TOOLS
    )
    assert EvidenceRetrievalAgent.allowed_tools == frozenset()
    assert VerificationAgent.allowed_tools == frozenset()
    assert InvestigationSupervisor.allowed_tools == frozenset()


def test_evidence_retrieval_rejects_duplicate_ids():
    context = _role_test_context()
    duplicated_evidence = [
        context.evidence[0],
        context.evidence[0],
    ]
    context = context.model_copy(
        update={"evidence": duplicated_evidence}
    )

    with pytest.raises(ValueError, match="Duplicate evidence IDs"):
        asyncio.run(EvidenceRetrievalAgent().retrieve(context))


def test_diagnosis_rejects_empty_collected_evidence():
    agent = DiagnosisAgent(MockInvestigationProvider())

    with pytest.raises(ValueError, match="requires collected evidence"):
        asyncio.run(
            agent.diagnose(_role_test_context(), [])
        )


def test_verification_accepts_grounded_hypothesis():
    verified = VerificationAgent().verify(
        _role_test_result(),
        _role_test_evidence(),
    )

    assert verified.hypotheses[0].id == "pool_exhaustion"


def test_verification_rejects_unknown_evidence_reference():
    result = _role_test_result()
    result["hypotheses"][0]["evidence_ids"] = ["missing-evidence"]

    with pytest.raises(
        ValueError,
        match="evidence that was not collected",
    ):
        VerificationAgent().verify(result, _role_test_evidence())


def test_verification_rejects_unsupported_hypothesis():
    result = _role_test_result()
    result["hypotheses"][0]["id"] = "unrelated_failure"

    with pytest.raises(
        ValueError,
        match="not supported by its cited evidence",
    ):
        VerificationAgent().verify(result, _role_test_evidence())


def test_supervisor_rejects_unverified_result():
    result = InvestigationResult.model_validate(_role_test_result())

    with pytest.raises(ValueError, match="unverified investigation"):
        InvestigationSupervisor().accept(result, False)


def test_supervisor_rejects_missing_verified_result():
    with pytest.raises(ValueError, match="no verified investigation"):
        InvestigationSupervisor().accept(None, True)


def test_supervisor_accepts_verified_result():
    result = InvestigationResult.model_validate(_role_test_result())

    accepted = InvestigationSupervisor().accept(result, True)

    assert accepted is result



def test_investigation_trace_records_all_stages():
    result, trace = asyncio.run(
        run_investigation_with_trace(
            latency_spike_scenario(),
            MockInvestigationProvider(),
        )
    )

    expected_stages = [
        "prepare_context",
        "evidence_agent",
        "diagnosis_agent",
        "verification_agent",
        "supervisor",
    ]

    assert result.hypotheses
    assert [record["stage"] for record in trace] == expected_stages
    assert all(record["status"] == "completed" for record in trace)
    assert all(record["duration_ms"] >= 0 for record in trace)
    assert all(record["run_id"] for record in trace)
    assert len({record["run_id"] for record in trace}) == 1

def test_failed_stage_trace_is_collected_once_with_run_id():
    class FailingProvider:
        name = "failing"

        async def investigate(self, context):
            raise RuntimeError("Simulated diagnosis failure")

    trace = []
    token = _active_trace.set(trace)

    try:
        with pytest.raises(Exception):
            asyncio.run(
                run_investigation(
                    latency_spike_scenario(),
                    FailingProvider(),
                )
            )
    finally:
        _active_trace.reset(token)

    assert [record["stage"] for record in trace] == [
        "prepare_context",
        "evidence_agent",
        "diagnosis_agent",
    ]
    assert [record["status"] for record in trace] == [
        "completed",
        "completed",
        "failed",
    ]
    assert all(record["run_id"] for record in trace)
    assert len({record["run_id"] for record in trace}) == 1
    assert trace[-1]["duration_ms"] >= 0
    assert len(trace) == 3
