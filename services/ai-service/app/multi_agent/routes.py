"""Tenant-scoped HTTP API for durable multi-agent tasks."""

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Security
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.agentops.routes import _get_or_create_tenant
from app.core.security import require_internal_token
from app.db.session import get_db
from app.models.multi_agent_task import MultiAgentTask
from app.multi_agent.contracts import TaskRequest
from app.multi_agent.repository import task_repository


router = APIRouter(
    prefix="/v1/multi-agent/tasks",
    tags=["multi-agent"],
    dependencies=[Security(require_internal_token)],
)


class TaskResponse(BaseModel):
    """Public task lifecycle fields; excludes internal lease and worker data."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    progress: dict[str, Any]
    result: dict[str, Any] | None
    error_code: str | None
    attempt_count: int
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


def _response_progress(task: MultiAgentTask) -> dict[str, Any]:
    progress = task.progress_json
    progress = progress if isinstance(progress, dict) else {}

    valid_phases = {
        "planning",
        "executing",
        "reviewing",
        "completed",
        "failed",
    }
    phase = progress.get("phase")

    if phase not in valid_phases:
        phase = {
            "queued": "planning",
            "running": "executing",
            "completed": "completed",
            "failed": "failed",
        }.get(task.status, "planning")

    steps = progress.get("steps")
    if not isinstance(steps, list):
        steps = []

    return {**progress, "phase": phase, "steps": steps}


def _to_response(task: MultiAgentTask) -> TaskResponse:
    return TaskResponse(
        id=task.id,
        status=task.status,
        progress=_response_progress(task),
        result=task.result_json,
        error_code=task.error_code,
        attempt_count=task.attempt_count,
        created_at=task.created_at,
        updated_at=task.updated_at,
        started_at=task.started_at,
        finished_at=task.finished_at,
    )


@router.post("", response_model=TaskResponse, status_code=201)
async def create_task(
    payload: TaskRequest,
    relay_user_id: str = Header(alias="X-Relay-User-Id"),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    """Validate and enqueue a task for asynchronous worker execution."""
    tenant = await _get_or_create_tenant(db, relay_user_id)

    task = await task_repository.create(
        db,
        tenant_id=tenant.id,
        request=payload,
    )
    await db.commit()
    await db.refresh(task)
    return _to_response(task)


@router.get("", response_model=list[TaskResponse])
async def list_tasks(
    relay_user_id: str = Header(alias="X-Relay-User-Id"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[TaskResponse]:
    """List recent tasks for the resolved tenant only."""
    tenant = await _get_or_create_tenant(db, relay_user_id)

    tasks = await task_repository.list_recent(
        db,
        tenant_id=tenant.id,
        limit=limit,
        offset=offset,
    )
    return [_to_response(task) for task in tasks]


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: uuid.UUID,
    relay_user_id: str = Header(alias="X-Relay-User-Id"),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    """Retrieve a task without revealing whether another tenant owns it."""
    tenant = await _get_or_create_tenant(db, relay_user_id)

    task = await task_repository.get(
        db,
        tenant_id=tenant.id,
        task_id=task_id,
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    return _to_response(task)
