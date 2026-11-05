"""Tenant-scoped persistence operations for multi-agent tasks."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.multi_agent_task import MultiAgentTask
from app.models.tenant import Tenant
from app.multi_agent.contracts import TaskRequest, TaskStatus


LEASE_SECONDS = 60
MAX_ATTEMPTS = 3
MAX_RECOVERY_BATCH = 100


def _utcnow() -> datetime:
    return datetime.now(UTC)


class MultiAgentTaskRepository:
    """Persist tasks without allowing cross-tenant task access."""

    async def create(
        self,
        db: AsyncSession,
        *,
        tenant_id: uuid.UUID,
        request: TaskRequest,
    ) -> MultiAgentTask:
        task = MultiAgentTask(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            status=TaskStatus.QUEUED.value,
            request_json=request.model_dump(mode="json"),
            progress_json={"phase": "planning", "steps": []},
            attempt_count=0,
        )
        db.add(task)
        await db.flush()
        await db.refresh(task)
        return task

    async def get(
        self,
        db: AsyncSession,
        *,
        tenant_id: uuid.UUID,
        task_id: uuid.UUID,
    ) -> MultiAgentTask | None:
        statement = select(MultiAgentTask).where(
            MultiAgentTask.tenant_id == tenant_id,
            MultiAgentTask.id == task_id,
        )
        return await db.scalar(statement)

    async def list_recent(
        self,
        db: AsyncSession,
        *,
        tenant_id: uuid.UUID,
        limit: int = 20,
        offset: int = 0,
    ) -> list[MultiAgentTask]:
        if not 1 <= limit <= 100:
            raise ValueError("limit must be between 1 and 100")
        if offset < 0:
            raise ValueError("offset must be non-negative")

        statement = (
            select(MultiAgentTask)
            .where(MultiAgentTask.tenant_id == tenant_id)
            .order_by(
                MultiAgentTask.created_at.desc(),
                MultiAgentTask.id.desc(),
            )
            .limit(limit)
            .offset(offset)
        )
        result = await db.scalars(statement)
        return list(result.all())

    async def claim_next(
        self,
        db: AsyncSession,
        *,
        worker_id: str,
    ) -> MultiAgentTask | None:
        """Atomically claim one queued task; caller owns the transaction."""
        if not worker_id or len(worker_id) > 100:
            raise ValueError("worker_id must contain 1 to 100 characters")

        statement = (
            select(MultiAgentTask)
            .where(MultiAgentTask.status == TaskStatus.QUEUED.value)
            .order_by(
                MultiAgentTask.created_at.asc(),
                MultiAgentTask.id.asc(),
            )
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        task = await db.scalar(statement)
        if task is None:
            return None

        now = _utcnow()
        task.status = TaskStatus.RUNNING.value
        task.worker_id = worker_id
        task.lease_token = uuid.uuid4()
        task.attempt_count += 1
        task.lease_expires_at = now + timedelta(seconds=LEASE_SECONDS)
        if task.started_at is None:
            task.started_at = now

        await db.flush()
        return task

    async def recover_expired_leases(
        self,
        db: AsyncSession,
        *,
        limit: int = MAX_RECOVERY_BATCH,
    ) -> dict[str, int]:
        """Recover expired task leases in a bounded, concurrency-safe batch."""
        if not 1 <= limit <= MAX_RECOVERY_BATCH:
            raise ValueError(
                f"limit must be between 1 and {MAX_RECOVERY_BATCH}"
            )

        now = _utcnow()
        statement = (
            select(MultiAgentTask)
            .where(
                MultiAgentTask.status == TaskStatus.RUNNING.value,
                MultiAgentTask.lease_expires_at.is_not(None),
                MultiAgentTask.lease_expires_at <= now,
            )
            .order_by(
                MultiAgentTask.lease_expires_at.asc(),
                MultiAgentTask.id.asc(),
            )
            .limit(limit)
            .with_for_update(skip_locked=True)
        )

        result = await db.scalars(statement)
        tasks = list(result.all())
        requeued = 0
        failed = 0

        for task in tasks:
            task.worker_id = None
            task.lease_token = None
            task.lease_expires_at = None

            if task.attempt_count >= MAX_ATTEMPTS:
                task.status = TaskStatus.FAILED.value
                task.error_code = "worker_lease_expired"
                task.finished_at = now
                failed += 1
            else:
                task.status = TaskStatus.QUEUED.value
                task.error_code = None
                requeued += 1

        if tasks:
            await db.flush()

        return {"requeued": requeued, "failed": failed}

    async def get_relay_user_id(
        self,
        db: AsyncSession,
        *,
        tenant_id: uuid.UUID,
    ) -> str | None:
        """Resolve the Relay user owning a tenant-scoped task."""
        statement = select(Tenant.relay_user_id).where(
            Tenant.id == tenant_id,
        )
        return await db.scalar(statement)

    async def update_progress(
        self,
        db: AsyncSession,
        *,
        tenant_id: uuid.UUID,
        task_id: uuid.UUID,
        worker_id: str,
        lease_token: uuid.UUID,
        progress: dict[str, Any],
    ) -> bool:
        """Persist a bounded progress snapshot for the current valid lease."""
        if not isinstance(progress, dict):
            raise ValueError("progress must be an object")

        allowed_phases = {
            "planning", "executing", "reviewing", "completed", "failed"
        }
        if set(progress) != {"phase", "steps"}:
            raise ValueError("progress must contain only phase and steps")
        if progress["phase"] not in allowed_phases:
            raise ValueError("invalid progress phase")

        steps = progress["steps"]
        if not isinstance(steps, list) or len(steps) > 12:
            raise ValueError("progress steps must contain at most 12 items")

        allowed_statuses = {
            "pending", "running", "completed", "failed", "skipped"
        }
        seen_step_ids: set[str] = set()
        for step in steps:
            if not isinstance(step, dict) or set(step) != {
                "step_id", "role", "status"
            }:
                raise ValueError("invalid progress step")

            step_id = step["step_id"]
            role = step["role"]
            status = step["status"]
            if (
                not isinstance(step_id, str)
                or not 1 <= len(step_id) <= 64
                or not step_id.isascii()
                or not step_id.replace("_", "").replace("-", "").isalnum()
                or not step_id[0].islower()
                or not isinstance(role, str)
                or role not in {"planner", "executor", "memory", "reviewer", "coordinator"}
                or not isinstance(status, str)
                or status not in allowed_statuses
                or step_id in seen_step_ids
            ):
                raise ValueError("invalid progress step fields")
            seen_step_ids.add(step_id)

        task = await db.scalar(
            select(MultiAgentTask)
            .where(
                MultiAgentTask.tenant_id == tenant_id,
                MultiAgentTask.id == task_id,
                MultiAgentTask.status == TaskStatus.RUNNING.value,
                MultiAgentTask.worker_id == worker_id,
                MultiAgentTask.lease_token == lease_token,
                MultiAgentTask.lease_expires_at > _utcnow(),
            )
            .with_for_update()
        )
        if task is None:
            return False

        task.progress_json = {
            "phase": progress["phase"],
            "steps": [
                {
                    "step_id": step["step_id"],
                    "role": step["role"],
                    "status": step["status"],
                }
                for step in steps
            ],
        }
        await db.flush()
        return True

    async def renew_lease(
        self,
        db: AsyncSession,
        *,
        task_id: uuid.UUID,
        worker_id: str,
        lease_token: uuid.UUID,
    ) -> bool:
        task = await db.scalar(
            select(MultiAgentTask)
            .where(
                MultiAgentTask.id == task_id,
                MultiAgentTask.status == TaskStatus.RUNNING.value,
                MultiAgentTask.worker_id == worker_id,
                MultiAgentTask.lease_token == lease_token,
                MultiAgentTask.lease_expires_at > _utcnow(),
            )
            .with_for_update()
        )
        if task is None:
            return False

        task.lease_expires_at = _utcnow() + timedelta(seconds=LEASE_SECONDS)
        await db.flush()
        return True

    async def complete(
        self,
        db: AsyncSession,
        *,
        tenant_id: uuid.UUID,
        task_id: uuid.UUID,
        worker_id: str,
        lease_token: uuid.UUID,
        result: dict[str, Any],
    ) -> bool:
        return await self._finish(
            db,
            tenant_id=tenant_id,
            task_id=task_id,
            worker_id=worker_id,
            lease_token=lease_token,
            status=TaskStatus.COMPLETED,
            result_json=result,
            error_code=None,
        )

    async def fail(
        self,
        db: AsyncSession,
        *,
        tenant_id: uuid.UUID,
        task_id: uuid.UUID,
        worker_id: str,
        lease_token: uuid.UUID,
        error_code: str,
    ) -> bool:
        if not error_code or len(error_code) > 80:
            raise ValueError("error_code must contain 1 to 80 characters")

        return await self._finish(
            db,
            tenant_id=tenant_id,
            task_id=task_id,
            worker_id=worker_id,
            lease_token=lease_token,
            status=TaskStatus.FAILED,
            result_json=None,
            error_code=error_code,
        )

    async def _finish(
        self,
        db: AsyncSession,
        *,
        tenant_id: uuid.UUID,
        task_id: uuid.UUID,
        worker_id: str,
        lease_token: uuid.UUID,
        status: TaskStatus,
        result_json: dict[str, Any] | None,
        error_code: str | None,
    ) -> bool:
        task = await db.scalar(
            select(MultiAgentTask)
            .where(
                MultiAgentTask.tenant_id == tenant_id,
                MultiAgentTask.id == task_id,
                MultiAgentTask.status == TaskStatus.RUNNING.value,
                MultiAgentTask.worker_id == worker_id,
                MultiAgentTask.lease_token == lease_token,
                MultiAgentTask.lease_expires_at > _utcnow(),
            )
            .with_for_update()
        )
        if task is None:
            return False

        task.status = status.value
        task.result_json = result_json
        task.error_code = error_code
        task.worker_id = None
        task.lease_token = None
        task.lease_expires_at = None
        task.finished_at = _utcnow()
        await db.flush()
        return True


task_repository = MultiAgentTaskRepository()
