"""Tests for tenant-scoped multi-agent task persistence."""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.dialects import postgresql

from app.models.multi_agent_task import MultiAgentTask
from app.multi_agent.contracts import TaskRequest, TaskStatus
from app.multi_agent.repository import MultiAgentTaskRepository


@pytest.fixture
def repository():
    return MultiAgentTaskRepository()


@pytest.mark.asyncio
async def test_create_persists_validated_request(repository):
    tenant_id = uuid.uuid4()
    db = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    task = await repository.create(
        db,
        tenant_id=tenant_id,
        request=TaskRequest(prompt="Summarize incident"),
    )

    assert task.tenant_id == tenant_id
    assert task.status == TaskStatus.QUEUED.value
    assert task.request_json["prompt"] == "Summarize incident"
    assert task.progress_json == {"phase": "planning", "steps": []}
    db.add.assert_called_once_with(task)
    db.flush.assert_awaited_once()
    db.refresh.assert_awaited_once_with(task)


@pytest.mark.asyncio
async def test_get_scopes_by_tenant_and_task(repository):
    tenant_id = uuid.uuid4()
    task_id = uuid.uuid4()
    db = MagicMock()
    db.scalar = AsyncMock(return_value=None)

    result = await repository.get(
        db,
        tenant_id=tenant_id,
        task_id=task_id,
    )

    assert result is None
    statement = db.scalar.await_args.args[0]
    sql = str(statement.compile(compile_kwargs={"literal_binds": True}))
    assert "multi_agent_tasks.tenant_id =" in sql
    assert "multi_agent_tasks.id =" in sql
    assert tenant_id.hex in sql
    assert task_id.hex in sql


@pytest.mark.asyncio
async def test_list_recent_is_tenant_scoped(repository):
    tenant_id = uuid.uuid4()
    db = MagicMock()
    result = MagicMock()
    result.all.return_value = []
    db.scalars = AsyncMock(return_value=result)

    tasks = await repository.list_recent(
        db,
        tenant_id=tenant_id,
        limit=10,
        offset=0,
    )

    assert tasks == []
    statement = db.scalars.await_args.args[0]
    sql = str(statement.compile(compile_kwargs={"literal_binds": True}))
    assert "multi_agent_tasks.tenant_id =" in sql
    assert tenant_id.hex in sql


@pytest.mark.asyncio
async def test_claim_uses_skip_locked_and_only_queued_tasks(repository):
    db = MagicMock()
    db.scalar = AsyncMock(return_value=None)

    task = await repository.claim_next(db, worker_id="worker-test")

    assert task is None
    statement = db.scalar.await_args.args[0]
    sql = str(statement.compile(
        dialect=postgresql.dialect(),
        compile_kwargs={"literal_binds": True},
    ))
    assert "multi_agent_tasks.status =" in sql
    assert "FOR UPDATE SKIP LOCKED" in sql


@pytest.mark.asyncio
async def test_claim_assigns_fresh_lease_token_and_increments_attempt(repository):
    db = MagicMock()
    task = MultiAgentTask(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        status=TaskStatus.QUEUED.value,
        request_json={"prompt": "claim me"},
        progress_json={"steps": []},
        attempt_count=0,
        worker_id=None,
        lease_token=None,
        lease_expires_at=None,
    )
    db.scalar = AsyncMock(return_value=task)
    db.flush = AsyncMock()

    claimed = await repository.claim_next(db, worker_id="worker-test")

    assert claimed is task
    assert claimed.status == TaskStatus.RUNNING.value
    assert claimed.worker_id == "worker-test"
    assert isinstance(claimed.lease_token, uuid.UUID)
    assert claimed.attempt_count == 1
    assert claimed.lease_expires_at is not None
    db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_claim_rejects_invalid_worker_id(repository):
    db = MagicMock()

    with pytest.raises(ValueError):
        await repository.claim_next(db, worker_id="")

    db.scalar.assert_not_called()


@pytest.mark.asyncio
async def test_renew_lease_requires_matching_worker(repository):
    db = MagicMock()
    db.scalar = AsyncMock(return_value=None)

    lease_token = uuid.uuid4()
    renewed = await repository.renew_lease(
        db,
        task_id=uuid.uuid4(),
        worker_id="worker-a",
        lease_token=lease_token,
    )

    assert renewed is False
    statement = db.scalar.await_args.args[0]
    sql = str(statement.compile(compile_kwargs={"literal_binds": True}))
    assert "multi_agent_tasks.id =" in sql
    assert "multi_agent_tasks.worker_id =" in sql
    assert "multi_agent_tasks.status =" in sql
    assert "multi_agent_tasks.lease_token =" in sql


@pytest.mark.asyncio
async def test_complete_requires_tenant_task_and_worker_match(repository):
    db = MagicMock()
    db.scalar = AsyncMock(return_value=None)

    lease_token = uuid.uuid4()
    completed = await repository.complete(
        db,
        tenant_id=uuid.uuid4(),
        task_id=uuid.uuid4(),
        worker_id="worker-a",
        lease_token=lease_token,
        result={"status": "completed"},
    )

    assert completed is False
    statement = db.scalar.await_args.args[0]
    sql = str(statement.compile(compile_kwargs={"literal_binds": True}))
    assert "multi_agent_tasks.tenant_id =" in sql
    assert "multi_agent_tasks.id =" in sql
    assert "multi_agent_tasks.worker_id =" in sql
    assert "multi_agent_tasks.lease_token =" in sql


@pytest.mark.asyncio
async def test_fail_rejects_empty_error_code(repository):
    db = MagicMock()

    with pytest.raises(ValueError):
        await repository.fail(
            db,
            tenant_id=uuid.uuid4(),
            task_id=uuid.uuid4(),
            worker_id="worker-a",
            lease_token=uuid.uuid4(),
            error_code="",
        )

    db.scalar.assert_not_called()


@pytest.mark.asyncio
async def test_list_recent_rejects_unbounded_pagination(repository):
    db = MagicMock()

    with pytest.raises(ValueError):
        await repository.list_recent(
            db,
            tenant_id=uuid.uuid4(),
            limit=1000,
        )

    with pytest.raises(ValueError):
        await repository.list_recent(
            db,
            tenant_id=uuid.uuid4(),
            offset=-1,
        )

    db.scalars.assert_not_called()

@pytest.mark.asyncio
async def test_recover_expired_leases_rejects_unbounded_batch(repository):
    db = MagicMock()

    with pytest.raises(ValueError):
        await repository.recover_expired_leases(db, limit=101)

    db.scalars.assert_not_called()


@pytest.mark.asyncio
async def test_recover_expired_leases_uses_skip_locked(repository):
    db = MagicMock()
    result = MagicMock()
    result.all.return_value = []
    db.scalars = AsyncMock(return_value=result)

    recovered = await repository.recover_expired_leases(db)

    assert recovered == {"requeued": 0, "failed": 0}
    statement = db.scalars.await_args.args[0]
    sql = str(statement.compile(
        dialect=postgresql.dialect(),
        compile_kwargs={"literal_binds": True},
    ))
    assert "FOR UPDATE SKIP LOCKED" in sql
    assert "multi_agent_tasks.lease_expires_at" in sql
    assert "multi_agent_tasks.status" in sql

@pytest.mark.asyncio
async def test_recover_expired_leases_requeues_and_fails_exhausted_tasks(
    repository,
):
    now = datetime.now(UTC)
    tenant_id = uuid.uuid4()

    retryable = MultiAgentTask(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        status=TaskStatus.RUNNING.value,
        request_json={"prompt": "retry me"},
        progress_json={"steps": []},
        attempt_count=1,
        worker_id="worker-a",
        lease_expires_at=now - timedelta(seconds=10),
        lease_token=uuid.uuid4(),
    )
    exhausted = MultiAgentTask(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        status=TaskStatus.RUNNING.value,
        request_json={"prompt": "fail safely"},
        progress_json={"steps": []},
        attempt_count=3,
        worker_id="worker-b",
        lease_expires_at=now - timedelta(seconds=5),
        lease_token=uuid.uuid4(),
    )

    db = MagicMock()
    result = MagicMock()
    result.all.return_value = [retryable, exhausted]
    db.scalars = AsyncMock(return_value=result)
    db.flush = AsyncMock()

    recovered = await repository.recover_expired_leases(db)

    assert recovered == {"requeued": 1, "failed": 1}

    assert retryable.status == TaskStatus.QUEUED.value
    assert retryable.worker_id is None
    assert retryable.lease_expires_at is None
    assert retryable.lease_token is None
    assert retryable.error_code is None

    assert exhausted.status == TaskStatus.FAILED.value
    assert exhausted.worker_id is None
    assert exhausted.lease_expires_at is None
    assert exhausted.lease_token is None
    assert exhausted.error_code == "worker_lease_expired"
    assert exhausted.finished_at is not None

    db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_progress_requires_matching_live_lease(repository):
    db = MagicMock()
    db.scalar = AsyncMock(return_value=None)

    updated = await repository.update_progress(
        db,
        tenant_id=uuid.uuid4(),
        task_id=uuid.uuid4(),
        worker_id="worker-a",
        lease_token=uuid.uuid4(),
        progress={"phase": "executing", "steps": []},
    )

    assert updated is False
    statement = db.scalar.await_args.args[0]
    sql = str(statement.compile(compile_kwargs={"literal_binds": True}))
    assert "multi_agent_tasks.tenant_id =" in sql
    assert "multi_agent_tasks.id =" in sql
    assert "multi_agent_tasks.worker_id =" in sql
    assert "multi_agent_tasks.lease_token =" in sql
    assert "multi_agent_tasks.lease_expires_at" in sql


@pytest.mark.asyncio
async def test_update_progress_persists_allowlisted_fields(repository):
    task = MultiAgentTask(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        status=TaskStatus.RUNNING.value,
        request_json={"prompt": "private prompt"},
        progress_json={"steps": []},
        attempt_count=1,
        worker_id="worker-a",
        lease_token=uuid.uuid4(),
        lease_expires_at=datetime.now(UTC) + timedelta(seconds=30),
    )
    db = MagicMock()
    db.scalar = AsyncMock(return_value=task)
    db.flush = AsyncMock()

    progress = {
        "phase": "executing",
        "steps": [
            {
                "step_id": "summarize",
                "role": "executor",
                "status": "running",
            }
        ],
    }

    updated = await repository.update_progress(
        db,
        tenant_id=task.tenant_id,
        task_id=task.id,
        worker_id=task.worker_id,
        lease_token=task.lease_token,
        progress=progress,
    )

    assert updated is True
    assert task.progress_json == progress
    db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_progress_rejects_invalid_snapshots(repository):
    db = MagicMock()

    invalid_snapshots = [
        {"phase": "unknown", "steps": []},
        {"phase": "executing", "steps": [], "prompt": "private"},
        {
            "phase": "executing",
            "steps": [
                {
                    "step_id": "step",
                    "role": "executor",
                    "status": "running",
                    "output": "private output",
                }
            ],
        },
        {
            "phase": "executing",
            "steps": [
                {
                    "step_id": f"step-{index}",
                    "role": "executor",
                    "status": "pending",
                }
                for index in range(13)
            ],
        },
    ]

    for progress in invalid_snapshots:
        with pytest.raises(ValueError):
            await repository.update_progress(
                db,
                tenant_id=uuid.uuid4(),
                task_id=uuid.uuid4(),
                worker_id="worker-a",
                lease_token=uuid.uuid4(),
                progress=progress,
            )

    db.scalar.assert_not_called()
