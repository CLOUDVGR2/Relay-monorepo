"""HTTP route handlers for routes in the Relay AI service."""


import hashlib
import json
import re
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Security
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.agentops.providers.factory import get_investigation_provider
from app.agentops.simulator import latency_spike_scenario, simulate_remediation
from app.agentops.workflow import (
    _active_trace,
    _trace_callback,
    run_investigation,
)
from app.core.security import require_internal_token
from app.db.session import AsyncSessionLocal, get_db
from app.models.incident import Incident, IncidentEvidence
from app.models.tenant import Tenant
from app.schemas.incidents import (
    ApprovalResponse,
    ExecuteRequest,
    IncidentCreate,
    IncidentResponse,
)

router = APIRouter(
    prefix="/v1/incidents",
    tags=["incident-intelligence"],
    dependencies=[Security(require_internal_token)],
)

APPROVAL_TTL = timedelta(minutes=10)


async def _persist_investigation_trace(
    incident_id: uuid.UUID,
    tenant_id: uuid.UUID,
    trace: list[dict[str, Any]],
) -> None:
    """Persist live trace progress without crossing tenant boundaries."""
    async with AsyncSessionLocal() as progress_db:
        incident = await progress_db.scalar(
            select(Incident).where(
                Incident.id == incident_id,
                Incident.tenant_id == tenant_id,
            )
        )
        if incident is None or incident.status != "investigating":
            return

        existing = incident.investigation_json
        progress = dict(existing) if isinstance(existing, dict) else {}
        progress["trace"] = trace
        incident.investigation_json = progress
        await progress_db.commit()


async def _get_or_create_tenant(
    db: AsyncSession, relay_user_id: str
) -> Tenant:
    """Resolve an authenticated Relay user to exactly one tenant."""
    if not re.fullmatch(r"[0-9a-fA-F]{24}", relay_user_id):
        raise HTTPException(status_code=400, detail="Invalid Relay user identity")

    relay_user_id = relay_user_id.lower()
    tenant = await db.scalar(
        select(Tenant).where(Tenant.relay_user_id == relay_user_id)
    )
    if tenant is not None:
        return tenant

    # Existing tenants are not automatically assigned to any Relay user.
    tenant = Tenant(
        name="Relay Workspace",
        slug=f"relay-{relay_user_id}",
        relay_user_id=relay_user_id,
    )
    db.add(tenant)
    try:
        await db.commit()
        await db.refresh(tenant)
        return tenant
    except IntegrityError:
        # Another request may have created this user's workspace concurrently.
        await db.rollback()
        tenant = await db.scalar(
            select(Tenant).where(Tenant.relay_user_id == relay_user_id)
        )
        if tenant is not None:
            return tenant
        raise HTTPException(
            status_code=409, detail="Unable to initialize Relay workspace"
        )


def _action_hash(action: dict) -> str:
    canonical = json.dumps(action, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def _audit(incident: Incident, event: str, **details) -> None:
    events = list(incident.audit_json or [])
    events.append({
        "event": event,
        "at": datetime.now(timezone.utc).isoformat(),
        **details,
    })
    incident.audit_json = events


def _response(incident: Incident) -> dict:
    return {
        "id": incident.id,
        "tenant_id": incident.tenant_id,
        "title": incident.title,
        "service": incident.service,
        "status": incident.status,
        "investigation": incident.investigation_json,
        "action": incident.action_json,
        "result": incident.result_json,
        "created_at": incident.created_at,
    }


async def _get_incident(
    db: AsyncSession, tenant_id: uuid.UUID, incident_id: uuid.UUID
) -> Incident:
    incident = await db.scalar(
        select(Incident)
        .where(
            Incident.tenant_id == tenant_id,
            Incident.id == incident_id,
        )
        .with_for_update()
    )
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@router.post("", response_model=IncidentResponse, status_code=201)
async def create_incident(
    payload: IncidentCreate,
    relay_user_id: str = Header(alias="X-Relay-User-Id"),
    db: AsyncSession = Depends(get_db),
):
    tenant = await _get_or_create_tenant(db, relay_user_id)

    scenario = latency_spike_scenario()
    incident = Incident(
        tenant_id=tenant.id,
        title="Checkout API p95 latency spike",
        service=scenario["service"],
        status="detected",
        audit_json=[],
    )
    _audit(incident, "incident_created", scenario_id=payload.scenario_id)
    db.add(incident)
    await db.flush()

    for item in scenario["evidence"]:
        db.add(IncidentEvidence(
            tenant_id=tenant.id,
            incident_id=incident.id,
            evidence_key=item["id"],
            evidence_type=item["type"],
            source=item["source"],
            observation=item["observation"],
            details_json={"supports": item["supports"]},
        ))

    await db.commit()
    await db.refresh(incident)
    return _response(incident)


@router.get("", response_model=list[IncidentResponse])
async def list_incidents(
    relay_user_id: str = Header(alias="X-Relay-User-Id"),
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    tenant = await _get_or_create_tenant(db, relay_user_id)
    limit = max(1, min(limit, 100))
    result = await db.scalars(
        select(Incident)
        .where(Incident.tenant_id == tenant.id)
        .order_by(Incident.created_at.desc())
        .limit(limit)
    )
    return [_response(item) for item in result.all()]


@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(
    incident_id: uuid.UUID,
    relay_user_id: str = Header(alias="X-Relay-User-Id"),
    db: AsyncSession = Depends(get_db),
):
    tenant = await _get_or_create_tenant(db, relay_user_id)
    incident = await _get_incident(db, tenant.id, incident_id)
    return _response(incident)


@router.post("/{incident_id}/investigate", response_model=IncidentResponse)
async def investigate(
    incident_id: uuid.UUID,
    relay_user_id: str = Header(alias="X-Relay-User-Id"),
    db: AsyncSession = Depends(get_db),
):
    tenant = await _get_or_create_tenant(db, relay_user_id)
    incident = await _get_incident(db, tenant.id, incident_id)
    if incident.status not in {"detected", "investigated"}:
        raise HTTPException(
            status_code=409,
            detail="Incident cannot be investigated in its current state",
        )

    investigation_started = time.perf_counter()
    scenario = latency_spike_scenario()
    trace: list[dict[str, Any]] = []

    # Commit before running agents to release the row lock and prevent
    # concurrent investigation requests from starting another run.
    incident.status = "investigating"
    incident.investigation_json = {"trace": []}
    incident.action_json = None
    await db.commit()

    async def publish_progress(snapshot: list[dict[str, Any]]) -> None:
        try:
            await _persist_investigation_trace(
                incident.id,
                tenant.id,
                snapshot,
            )
        except Exception:
            # A dashboard progress-write failure must not fail the investigation.
            import logging
            logging.getLogger(__name__).warning(
                "Could not persist live investigation progress",
                exc_info=True,
            )

    trace_token = _active_trace.set(trace)
    callback_token = _trace_callback.set(publish_progress)

    try:
        provider = get_investigation_provider()
        result = await run_investigation(scenario, provider)
    except Exception as exc:
        duration_ms = round(
            (time.perf_counter() - investigation_started) * 1000, 2
        )
        incident.status = "detected"
        incident.action_json = None
        incident.investigation_json = {"trace": trace} if trace else None
        _audit(
            incident,
            "investigation_failed",
            duration_ms=duration_ms,
            error_type=type(exc).__name__,
        )
        await db.commit()
        raise HTTPException(
            status_code=502,
            detail="Incident investigation failed; no remediation was approved",
        ) from exc
    finally:
        _trace_callback.reset(callback_token)
        _active_trace.reset(trace_token)

    duration_ms = round(
        (time.perf_counter() - investigation_started) * 1000, 2
    )
    result_data = result.model_dump()
    evidence_ids = {item["id"] for item in scenario["evidence"]}

    hypotheses = sorted(
        result_data["hypotheses"],
        key=lambda item: item["confidence"],
        reverse=True,
    )

    report = {
        "scenario_id": scenario["scenario_id"],
        "service": scenario["service"],
        "signal": scenario["signal"],
        "evidence": scenario["evidence"],
        "hypotheses": hypotheses,
        "leading_hypothesis": hypotheses[0],
        "proposed_action": result_data["proposed_action"],
        "limitations": result_data["limitations"],
        "summary": result_data["summary"],
        "provider": provider.name,
        "trace": trace,
    }

    # Defense in depth: only scenario evidence may support a hypothesis.
    if any(
        not set(item["evidence_ids"]).issubset(evidence_ids)
        for item in hypotheses
    ):
        incident.status = "detected"
        incident.action_json = None
        incident.investigation_json = {"trace": trace} if trace else None
        _audit(
            incident,
            "investigation_failed",
            duration_ms=duration_ms,
            error_type="EvidenceValidationError",
        )
        await db.commit()
        raise HTTPException(
            status_code=502,
            detail="Incident investigation failed evidence validation",
        )

    incident.investigation_json = report
    incident.action_json = result_data["proposed_action"]
    incident.status = "investigated"
    _audit(
        incident,
        "investigation_completed",
        provider=provider.name,
        evidence_count=len(report["evidence"]),
        hypothesis_count=len(report["hypotheses"]),
        duration_ms=duration_ms,
    )
    await db.commit()
    await db.refresh(incident)
    return _response(incident)


@router.post("/{incident_id}/approve", response_model=ApprovalResponse)
async def approve_remediation(
    incident_id: uuid.UUID,
    relay_user_id: str = Header(alias="X-Relay-User-Id"),
    db: AsyncSession = Depends(get_db),
):
    tenant = await _get_or_create_tenant(db, relay_user_id)
    incident = await _get_incident(db, tenant.id, incident_id)
    if incident.status != "investigated" or not incident.action_json:
        raise HTTPException(
            status_code=409,
            detail="A completed investigation is required before approval",
        )

    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + APPROVAL_TTL
    incident.approval_token_hash = hashlib.sha256(token.encode()).hexdigest()
    incident.approval_action_hash = _action_hash(incident.action_json)
    incident.approval_expires_at = expires
    incident.status = "approved"
    _audit(
        incident,
        "remediation_approved",
        action_hash=incident.approval_action_hash,
        expires_at=expires.isoformat(),
    )
    await db.commit()

    return {
        "incident_id": incident.id,
        "status": "approved",
        "approval_token": token,
        "expires_at": expires,
    }


@router.post("/{incident_id}/execute", response_model=IncidentResponse)
async def execute_remediation(
    incident_id: uuid.UUID,
    payload: ExecuteRequest,
    relay_user_id: str = Header(alias="X-Relay-User-Id"),
    db: AsyncSession = Depends(get_db),
):
    tenant = await _get_or_create_tenant(db, relay_user_id)
    incident = await _get_incident(db, tenant.id, incident_id)

    if incident.status != "approved":
        raise HTTPException(status_code=409, detail="Incident is not approved")

    supplied_hash = hashlib.sha256(payload.approval_token.encode()).hexdigest()
    if not incident.approval_token_hash or not secrets.compare_digest(
        supplied_hash, incident.approval_token_hash
    ):
        raise HTTPException(status_code=403, detail="Invalid approval token")

    if (
        incident.approval_expires_at is None
        or incident.approval_expires_at <= datetime.now(timezone.utc)
    ):
        incident.status = "approval_expired"
        incident.approval_token_hash = None
        _audit(incident, "approval_expired")
        await db.commit()
        raise HTTPException(status_code=403, detail="Approval has expired")

    if (
        not incident.action_json
        or _action_hash(incident.action_json) != incident.approval_action_hash
    ):
        incident.status = "approval_invalidated"
        incident.approval_token_hash = None
        incident.approval_action_hash = None
        _audit(incident, "approved_action_changed")
        await db.commit()
        raise HTTPException(status_code=409, detail="Approved action has changed")

    # Consume approval before executing. The simulator has a fixed allowlist
    # and never contacts or modifies real infrastructure.
    incident.approval_token_hash = None
    incident.status = "executing"
    incident.execution_started_at = datetime.now(timezone.utc)
    _audit(incident, "simulated_execution_started")
    await db.commit()

    try:
        simulated = simulate_remediation(
            latency_spike_scenario(),
            incident.action_json["action_id"],
        )
        incident.result_json = simulated["verification"]
        incident.status = (
            "resolved_simulated"
            if simulated["verification"]["passed"]
            else "verification_failed"
        )
        _audit(
            incident,
            "simulated_execution_finished",
            result=incident.status,
            after_ms=simulated["verification"]["after_ms"],
        )
        await db.commit()
    except Exception:
        incident.status = "execution_failed"
        _audit(incident, "simulated_execution_failed")
        await db.commit()
        raise HTTPException(status_code=500, detail="Simulation failed")

    await db.refresh(incident)
    return _response(incident)


@router.post("/{incident_id}/recover", response_model=IncidentResponse)
async def recover_interrupted_execution(
    incident_id: uuid.UUID,
    relay_user_id: str = Header(alias="X-Relay-User-Id"),
    db: AsyncSession = Depends(get_db),
):
    """Mark a stale execution interrupted; never automatically replay it."""
    tenant = await _get_or_create_tenant(db, relay_user_id)
    incident = await _get_incident(db, tenant.id, incident_id)

    if incident.status != "executing":
        raise HTTPException(
            status_code=409,
            detail="Incident is not currently executing",
        )

    now = datetime.now(timezone.utc)
    started_at = incident.execution_started_at

    if started_at is None or started_at > now - timedelta(minutes=2):
        raise HTTPException(
            status_code=409,
            detail="Execution is not stale enough to recover",
        )

    incident.status = "execution_interrupted"
    incident.approval_token_hash = None
    _audit(
        incident,
        "execution_interrupted",
        reason="Execution exceeded recovery threshold; outcome requires review",
    )
    await db.commit()
    await db.refresh(incident)
    return _response(incident)
