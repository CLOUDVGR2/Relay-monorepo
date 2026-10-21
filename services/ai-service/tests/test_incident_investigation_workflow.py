"""Tests for test incident investigation workflow in the Relay AI service."""


from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import uuid

import pytest
from fastapi import HTTPException

from app.agentops import routes
from app.agentops.contracts import (
    Hypothesis,
    InvestigationResult,
    RemediationRecommendation,
)


class FakeDatabase:
    def __init__(self):
        self.commits = 0
        self.refreshes = 0

    async def commit(self):
        self.commits += 1

    async def refresh(self, instance):
        self.refreshes += 1


@pytest.fixture
def incident_context(monkeypatch):
    tenant_id = uuid.uuid4()
    incident = SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        title="API latency spike",
        service="checkout-api",
        status="detected",
        investigation_json=None,
        action_json=None,
        result_json=None,
        audit_json=[],
        approval_token_hash=None,
        approval_action_hash=None,
        approval_expires_at=None,
        created_at=datetime.now(timezone.utc),
    )
    db = FakeDatabase()

    async def fake_tenant(session, relay_user_id):
        return SimpleNamespace(id=tenant_id)

    async def fake_incident(session, resolved_tenant_id, incident_id):
        assert resolved_tenant_id == tenant_id
        assert incident_id == incident.id
        return incident

    monkeypatch.setattr(routes, "_get_or_create_tenant", fake_tenant)
    monkeypatch.setattr(routes, "_get_incident", fake_incident)

    return incident, db


@pytest.mark.asyncio
async def test_provider_failure_keeps_incident_uninvestigated(
    monkeypatch, incident_context
):
    incident, db = incident_context
    monkeypatch.setattr(
        routes,
        "get_investigation_provider",
        lambda: SimpleNamespace(name="test-provider"),
    )

    async def fail_investigation(scenario, provider):
        raise RuntimeError("sensitive provider details")

    monkeypatch.setattr(routes, "run_investigation", fail_investigation)

    with pytest.raises(HTTPException) as error:
        await routes.investigate(incident.id, "507f1f77bcf86cd799439011", db)

    assert error.value.status_code == 502
    assert "sensitive provider details" not in str(error.value.detail)
    assert incident.status == "detected"
    assert incident.investigation_json is None
    assert incident.action_json is None
    assert incident.audit_json[-1]["event"] == "investigation_failed"
    assert incident.audit_json[-1]["error_type"] == "RuntimeError"
    assert db.commits == 2


@pytest.mark.asyncio
async def test_fabricated_evidence_is_not_persisted(
    monkeypatch, incident_context
):
    incident, db = incident_context
    monkeypatch.setattr(
        routes,
        "get_investigation_provider",
        lambda: SimpleNamespace(name="test-provider"),
    )

    fabricated_result = InvestigationResult(
        summary="Potential database issue",
        hypotheses=[
            Hypothesis(
                id="database_pool_exhaustion",
                summary="Database pool exhaustion",
                confidence=0.9,
                evidence_ids=["fabricated-evidence"],
            )
        ],
        proposed_action=RemediationRecommendation(
            action_id="simulate_pool_recovery",
            description="Simulate database pool recovery",
            risk="low",
            execution_environment="simulator",
        ),
        limitations=["Test result"],
    )

    async def return_fabricated_result(scenario, provider):
        return fabricated_result

    monkeypatch.setattr(
        routes, "run_investigation", return_fabricated_result
    )

    with pytest.raises(HTTPException) as error:
        await routes.investigate(incident.id, "507f1f77bcf86cd799439011", db)

    assert error.value.status_code == 502
    assert incident.status == "detected"
    assert incident.investigation_json is None
    assert incident.action_json is None
    assert incident.audit_json[-1]["event"] == "investigation_failed"
    assert incident.audit_json[-1]["error_type"] == "EvidenceValidationError"
    assert db.commits == 2


@pytest.mark.asyncio
async def test_approval_rejected_after_failed_investigation(
    incident_context,
):
    incident, db = incident_context
    incident.status = "detected"
    incident.audit_json.append({"event": "investigation_failed"})

    with pytest.raises(HTTPException) as error:
        await routes.approve_remediation(
            incident.id, "507f1f77bcf86cd799439011", db
        )

    assert error.value.status_code == 409
    assert incident.status == "detected"
    assert incident.approval_token_hash is None
    assert db.commits == 0


@pytest.mark.asyncio
async def test_successful_investigation_persists_validated_report(
    monkeypatch, incident_context
):
    incident, db = incident_context
    monkeypatch.setenv("AI_PROVIDER", "mock")

    response = await routes.investigate(
        incident.id, "507f1f77bcf86cd799439011", db
    )

    assert response["status"] == "investigated"
    assert response["investigation"]["provider"] == "mock"
    assert len(response["investigation"]["evidence"]) == 4
    assert response["investigation"]["hypotheses"]
    assert response["action"]["action_id"] == "simulate_pool_recovery"
    assert incident.audit_json[-1]["event"] == "investigation_completed"
    assert db.commits == 2
    assert db.refreshes == 1


@pytest.mark.asyncio
async def test_approval_issues_hashed_token_for_investigated_incident(
    incident_context,
):
    import hashlib
    from datetime import timedelta

    incident, db = incident_context
    incident.status = "investigated"
    incident.action_json = {
        "action_id": "simulate_pool_recovery",
        "description": "Simulate pool recovery",
        "risk": "low",
        "execution_environment": "simulator",
    }

    response = await routes.approve_remediation(
        incident.id, "507f1f77bcf86cd799439011", db
    )

    token = response["approval_token"]
    assert response["status"] == "approved"
    assert incident.status == "approved"
    assert incident.approval_token_hash == hashlib.sha256(
        token.encode()
    ).hexdigest()
    assert incident.approval_token_hash != token
    assert incident.approval_action_hash == routes._action_hash(
        incident.action_json
    )
    assert incident.approval_expires_at > datetime.now(timezone.utc)
    assert incident.approval_expires_at <= (
        datetime.now(timezone.utc) + timedelta(minutes=11)
    )
    assert incident.audit_json[-1]["event"] == "remediation_approved"
    assert db.commits == 1


@pytest.mark.asyncio
async def test_execution_rejects_invalid_token_without_running_simulator(
    monkeypatch, incident_context,
):
    import hashlib

    incident, db = incident_context
    incident.status = "approved"
    incident.action_json = {
        "action_id": "simulate_pool_recovery",
        "description": "Simulate pool recovery",
        "risk": "low",
        "execution_environment": "simulator",
    }
    incident.approval_token_hash = hashlib.sha256(
        b"a-valid-token-that-is-not-supplied"
    ).hexdigest()
    incident.approval_action_hash = routes._action_hash(incident.action_json)
    incident.approval_expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=5
    )

    def simulator_must_not_run(*args, **kwargs):
        pytest.fail("Simulator must not run for an invalid approval token")

    monkeypatch.setattr(routes, "simulate_remediation", simulator_must_not_run)

    from app.schemas.incidents import ExecuteRequest

    with pytest.raises(HTTPException) as error:
        await routes.execute_remediation(
            incident.id,
            ExecuteRequest(approval_token="x" * 40),
            "507f1f77bcf86cd799439011",
            db,
        )

    assert error.value.status_code == 403
    assert incident.status == "approved"
    assert db.commits == 0


@pytest.mark.asyncio
async def test_execution_rejects_expired_approval_without_running_simulator(
    monkeypatch, incident_context,
):
    import hashlib

    incident, db = incident_context
    token = "valid-test-approval-token-0123456789abcdef"
    incident.status = "approved"
    incident.action_json = {
        "action_id": "simulate_pool_recovery",
        "description": "Simulate pool recovery",
        "risk": "low",
        "execution_environment": "simulator",
    }
    incident.approval_token_hash = hashlib.sha256(token.encode()).hexdigest()
    incident.approval_action_hash = routes._action_hash(incident.action_json)
    incident.approval_expires_at = datetime.now(timezone.utc) - timedelta(
        minutes=1
    )

    def simulator_must_not_run(*args, **kwargs):
        pytest.fail("Simulator must not run for an expired approval")

    monkeypatch.setattr(routes, "simulate_remediation", simulator_must_not_run)

    from app.schemas.incidents import ExecuteRequest

    with pytest.raises(HTTPException) as error:
        await routes.execute_remediation(
            incident.id,
            ExecuteRequest(approval_token=token),
            "507f1f77bcf86cd799439011",
            db,
        )

    assert error.value.status_code == 403
    assert incident.status == "approval_expired"
    assert incident.approval_token_hash is None
    assert incident.audit_json[-1]["event"] == "approval_expired"
    assert db.commits == 1


@pytest.mark.asyncio
async def test_execution_rejects_changed_action_without_running_simulator(
    monkeypatch, incident_context,
):
    import hashlib

    incident, db = incident_context
    token = "valid-test-approval-token-0123456789abcdef"
    approved_action = {
        "action_id": "simulate_pool_recovery",
        "description": "Simulate pool recovery",
        "risk": "low",
        "execution_environment": "simulator",
    }
    incident.status = "approved"
    incident.action_json = approved_action.copy()
    incident.approval_token_hash = hashlib.sha256(token.encode()).hexdigest()
    incident.approval_action_hash = routes._action_hash(approved_action)
    incident.approval_expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=5
    )

    # Simulate action data being altered after approval.
    incident.action_json["action_id"] = "unapproved_action"

    def simulator_must_not_run(*args, **kwargs):
        pytest.fail("Simulator must not run for a changed approved action")

    monkeypatch.setattr(routes, "simulate_remediation", simulator_must_not_run)

    from app.schemas.incidents import ExecuteRequest

    with pytest.raises(HTTPException) as error:
        await routes.execute_remediation(
            incident.id,
            ExecuteRequest(approval_token=token),
            "507f1f77bcf86cd799439011",
            db,
        )

    assert error.value.status_code == 409
    assert error.value.detail == "Approved action has changed"
    assert incident.status == "approval_invalidated"
    assert incident.approval_token_hash is None
    assert incident.approval_action_hash is None
    assert incident.audit_json[-1]["event"] == "approved_action_changed"
    assert db.commits == 1
