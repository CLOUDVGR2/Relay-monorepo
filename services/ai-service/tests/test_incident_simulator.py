"""Tests for test incident simulator in the Relay AI service."""


import pytest

from app.agentops.engine import investigate_incident
from app.agentops.simulator import latency_spike_scenario, simulate_remediation


def test_investigation_has_evidence_backed_hypotheses():
    report = investigate_incident()
    evidence_ids = {item["id"] for item in report["evidence"]}

    assert report["leading_hypothesis"]["id"] == "database_pool_exhaustion"
    assert report["leading_hypothesis"]["confidence"] == 0.94
    assert report["leading_hypothesis"]["evidence_ids"]
    assert all(
        set(item["evidence_ids"]).issubset(evidence_ids)
        for item in report["hypotheses"]
    )
    assert report["limitations"]


def test_simulation_verifies_latency_recovery():
    scenario = latency_spike_scenario()
    result = simulate_remediation(scenario, "simulate_pool_recovery")

    assert result["verification"]["passed"] is True
    assert result["verification"]["before_ms"] == 2400.0
    assert result["verification"]["after_ms"] == 165.0
    assert result["verification"]["environment"] == "simulator"
    assert scenario["signal"]["observed_ms"] == 2400.0


def test_simulator_rejects_unapproved_action_type():
    with pytest.raises(ValueError, match="not allowlisted"):
        simulate_remediation(
            latency_spike_scenario(),
            "run_arbitrary_shell_command",
        )


def test_simulator_rejects_unknown_scenario():
    with pytest.raises(ValueError, match="Unsupported"):
        simulate_remediation({"scenario_id": "real-production"}, "simulate_pool_recovery")
