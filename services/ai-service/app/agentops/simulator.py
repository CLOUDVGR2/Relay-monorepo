"""Deterministic incident scenarios and safe remediation simulation."""

from copy import deepcopy


def latency_spike_scenario() -> dict:
    """Return a reproducible, entirely simulated production incident."""
    return {
        "scenario_id": "api-latency-spike-v1",
        "service": "checkout-api",
        "signal": {
            "metric": "http.server.request.duration.p95",
            "baseline_ms": 180.0,
            "observed_ms": 2400.0,
            "threshold_ms": 500.0,
        },
        "evidence": [
            {
                "id": "metric-001",
                "type": "metric",
                "source": "simulated_metrics",
                "observation": "p95 latency increased from 180 ms to 2400 ms",
                "supports": ["database_pool_exhaustion", "dependency_latency"],
            },
            {
                "id": "log-001",
                "type": "log",
                "source": "simulated_logs",
                "observation": "connection pool acquisition timeout rate increased",
                "supports": ["database_pool_exhaustion"],
            },
            {
                "id": "deploy-001",
                "type": "deployment",
                "source": "simulated_deployments",
                "observation": "application deployment occurred shortly before the spike",
                "supports": ["deployment_regression"],
            },
            {
                "id": "health-001",
                "type": "health",
                "source": "simulated_service_health",
                "observation": "dependency health is degraded in the scenario",
                "supports": ["dependency_latency"],
            },
        ],
        "hypotheses": [
            {
                "id": "database_pool_exhaustion",
                "summary": "Database connection pool exhaustion",
                "confidence": 0.94,
                "evidence_ids": ["metric-001", "log-001"],
            },
            {
                "id": "dependency_latency",
                "summary": "Slow downstream dependency",
                "confidence": 0.52,
                "evidence_ids": ["metric-001", "health-001"],
            },
            {
                "id": "deployment_regression",
                "summary": "Regression introduced by a recent deployment",
                "confidence": 0.35,
                "evidence_ids": ["deploy-001"],
            },
        ],
        "proposed_action": {
            "action_id": "simulate_pool_recovery",
            "description": "Simulate recovery of the database connection pool",
            "risk": "low",
            "execution_environment": "simulator",
        },
    }


def simulate_remediation(scenario: dict, action_id: str) -> dict:
    """Execute only a known, allowlisted simulated action."""
    if action_id != "simulate_pool_recovery":
        raise ValueError("Action is not allowlisted by the simulator")

    if scenario.get("scenario_id") != "api-latency-spike-v1":
        raise ValueError("Unsupported simulation scenario")

    result = deepcopy(scenario)
    result["signal"]["observed_ms"] = 165.0
    result["verification"] = {
        "passed": result["signal"]["observed_ms"] < result["signal"]["threshold_ms"],
        "before_ms": scenario["signal"]["observed_ms"],
        "after_ms": result["signal"]["observed_ms"],
        "threshold_ms": result["signal"]["threshold_ms"],
        "environment": "simulator",
    }
    return result
