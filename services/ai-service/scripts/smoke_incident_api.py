"""Smoke incident api module for the Relay AI service."""


import asyncio
import os
import secrets
from datetime import datetime, timedelta, timezone

os.environ["PYTHON_AI_INTERNAL_TOKEN"] = "local-incident-smoke-test-token"

import httpx
from sqlalchemy import delete, func, select

from app.db.session import AsyncSessionLocal, engine
from app.main import app
from app.models.incident import Incident, IncidentEvidence
from app.models.tenant import Tenant

TOKEN = os.environ["PYTHON_AI_INTERNAL_TOKEN"]
USER_A = secrets.token_hex(12)
USER_B = secrets.token_hex(12)
AUTH = {"Authorization": f"Bearer {TOKEN}"}


async def main():
    transport = httpx.ASGITransport(app=app)
    incident_id = None

    try:
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
            timeout=15,
        ) as client:
            def headers(user_id):
                return {**AUTH, "X-Relay-User-Id": user_id}

            # Create an incident for user A.
            response = await client.post(
                "/v1/incidents",
                headers=headers(USER_A),
                json={"scenario_id": "api-latency-spike-v1"},
            )
            assert response.status_code == 201, (
                f"Create failed: {response.status_code} {response.text}"
            )
            incident = response.json()
            incident_id = incident["id"]
            tenant_a = incident["tenant_id"]
            print("PASS: incident created for user A")

            # Verify evidence persisted in PostgreSQL.
            async with AsyncSessionLocal() as db:
                evidence_count = await db.scalar(
                    select(func.count())
                    .select_from(IncidentEvidence)
                    .where(IncidentEvidence.incident_id == incident_id)
                )
            assert evidence_count == 4, f"Expected 4 evidence rows, got {evidence_count}"
            print("PASS: all four evidence records persisted")

            # User B must not read or mutate user A's incident.
            for method, path, kwargs in [
                ("GET", f"/v1/incidents/{incident_id}", {}),
                ("POST", f"/v1/incidents/{incident_id}/investigate", {"json": {}}),
                ("POST", f"/v1/incidents/{incident_id}/approve", {"json": {}}),
            ]:
                denied = await client.request(
                    method,
                    path,
                    headers=headers(USER_B),
                    **kwargs,
                )
                assert denied.status_code == 404, (
                    f"{method} {path} returned {denied.status_code}, expected 404"
                )
            print("PASS: cross-user read and mutation attempts return 404")

            # User B's list must not contain user A's incident.
            response = await client.get(
                "/v1/incidents",
                headers=headers(USER_B),
            )
            assert response.status_code == 200
            assert all(item["id"] != incident_id for item in response.json())
            print("PASS: incident list is tenant-isolated")

            # Investigate, approve, and execute the simulator action.
            response = await client.post(
                f"/v1/incidents/{incident_id}/investigate",
                headers=headers(USER_A),
                json={},
            )
            assert response.status_code == 200, response.text
            assert response.json()["status"] == "investigated"
            print("PASS: investigation completed")

            response = await client.post(
                f"/v1/incidents/{incident_id}/approve",
                headers=headers(USER_A),
                json={},
            )
            assert response.status_code == 200, response.text
            approval_token = response.json()["approval_token"]
            assert len(approval_token) >= 32
            print("PASS: one-time approval issued")

            response = await client.post(
                f"/v1/incidents/{incident_id}/execute",
                headers=headers(USER_A),
                json={"approval_token": "invalid-" + "x" * 32},
            )
            assert response.status_code == 403, (
                f"Invalid approval returned {response.status_code}: {response.text}"
            )
            print("PASS: invalid approval rejected")

            response = await client.post(
                f"/v1/incidents/{incident_id}/execute",
                headers=headers(USER_A),
                json={"approval_token": approval_token},
            )
            assert response.status_code == 200, response.text
            result = response.json()
            assert result["status"] == "resolved_simulated"
            assert result["result"]["environment"] == "simulator"
            assert result["result"]["before_ms"] == 2400.0
            assert result["result"]["after_ms"] == 165.0
            print("PASS: approved simulator remediation verified (2400 ms -> 165 ms)")

            # A consumed approval cannot be replayed.
            response = await client.post(
                f"/v1/incidents/{incident_id}/execute",
                headers=headers(USER_A),
                json={"approval_token": approval_token},
            )
            assert response.status_code == 409, (
                f"Replay returned {response.status_code}: {response.text}"
            )
            print("PASS: approval replay rejected")

            # Approval expiry must invalidate the credential.
            expired_create = await client.post(
                "/v1/incidents",
                headers=headers(USER_A),
                json={"scenario_id": "api-latency-spike-v1"},
            )
            assert expired_create.status_code == 201, expired_create.text
            expired_id = expired_create.json()["id"]

            investigated = await client.post(
                f"/v1/incidents/{expired_id}/investigate",
                headers=headers(USER_A),
                json={},
            )
            assert investigated.status_code == 200, investigated.text

            approved = await client.post(
                f"/v1/incidents/{expired_id}/approve",
                headers=headers(USER_A),
                json={},
            )
            assert approved.status_code == 200, approved.text
            expired_token = approved.json()["approval_token"]

            async with AsyncSessionLocal() as db:
                expired_incident = await db.get(Incident, expired_id)
                expired_incident.approval_expires_at = (
                    datetime.now(timezone.utc) - timedelta(seconds=1)
                )
                await db.commit()

            expired_response = await client.post(
                f"/v1/incidents/{expired_id}/execute",
                headers=headers(USER_A),
                json={"approval_token": expired_token},
            )
            assert expired_response.status_code == 403, (
                f"Expired approval returned {expired_response.status_code}: "
                f"{expired_response.text}"
            )

            async with AsyncSessionLocal() as db:
                expired_saved = await db.get(Incident, expired_id)
                assert expired_saved.status == "approval_expired"
                assert expired_saved.approval_token_hash is None
                assert any(
                    event["event"] == "approval_expired"
                    for event in expired_saved.audit_json
                )
            print("PASS: expired approval rejected and audited")

            # Recovery must reject a recent execution and recover a stale one.
            recovery_create = await client.post(
                "/v1/incidents",
                headers=headers(USER_A),
                json={"scenario_id": "api-latency-spike-v1"},
            )
            assert recovery_create.status_code == 201, recovery_create.text
            recovery_id = recovery_create.json()["id"]

            recovery_investigation = await client.post(
                f"/v1/incidents/{recovery_id}/investigate",
                headers=headers(USER_A),
                json={},
            )
            assert recovery_investigation.status_code == 200

            async with AsyncSessionLocal() as db:
                recovery_incident = await db.get(Incident, recovery_id)
                recovery_incident.status = "executing"
                recovery_incident.execution_started_at = datetime.now(timezone.utc)
                await db.commit()

            recent_recovery = await client.post(
                f"/v1/incidents/{recovery_id}/recover",
                headers=headers(USER_A),
                json={},
            )
            assert recent_recovery.status_code == 409, (
                f"Recent execution recovery returned {recent_recovery.status_code}: "
                f"{recent_recovery.text}"
            )
            print("PASS: recent execution is not recovered prematurely")

            async with AsyncSessionLocal() as db:
                recovery_incident = await db.get(Incident, recovery_id)
                recovery_incident.execution_started_at = (
                    datetime.now(timezone.utc) - timedelta(minutes=3)
                )
                await db.commit()

            stale_recovery = await client.post(
                f"/v1/incidents/{recovery_id}/recover",
                headers=headers(USER_A),
                json={},
            )
            assert stale_recovery.status_code == 200, stale_recovery.text
            assert stale_recovery.json()["status"] == "execution_interrupted"

            async with AsyncSessionLocal() as db:
                recovered = await db.get(Incident, recovery_id)
                assert recovered.status == "execution_interrupted"
                assert recovered.approval_token_hash is None
                assert any(
                    event["event"] == "execution_interrupted"
                    for event in recovered.audit_json
                )
            print("PASS: stale execution recovered without replay")

            # A recovered execution must not be executable using an old token.
            recovered_execute = await client.post(
                f"/v1/incidents/{recovery_id}/execute",
                headers=headers(USER_A),
                json={"approval_token": "stale-token-" + "x" * 32},
            )
            assert recovered_execute.status_code == 409, (
                f"Recovered execution was not blocked: "
                f"{recovered_execute.status_code} {recovered_execute.text}"
            )
            print("PASS: recovered execution cannot be replayed")

            # Confirm the final state was persisted.
            async with AsyncSessionLocal() as db:
                saved = await db.get(Incident, incident_id)
                assert saved is not None
                assert saved.status == "resolved_simulated"
                assert saved.result_json["passed"] is True
                assert any(
                    event["event"] == "simulated_execution_started"
                    for event in saved.audit_json
                )
            print("PASS: final incident state and audit persisted")

    finally:
        # Delete only the two temporary test tenants; database foreign keys
        # cascade to the incidents and evidence created for these identities.
        async with AsyncSessionLocal() as db:
            await db.execute(
                delete(Tenant).where(Tenant.relay_user_id.in_([USER_A, USER_B]))
            )
            await db.commit()
        await engine.dispose()

    print("\nALL INCIDENT API SMOKE TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
