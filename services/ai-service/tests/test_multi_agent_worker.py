"""Isolated lifecycle tests for the multi-agent worker."""

import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.multi_agent.contracts import TaskRequest, TaskResult, TaskStatus
from app.multi_agent.worker import MultiAgentWorker


def make_session_factory():
    db = MagicMock()
    transaction = MagicMock()
    transaction.__aenter__ = AsyncMock(return_value=None)
    transaction.__aexit__ = AsyncMock(return_value=False)
    db.begin.return_value = transaction
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=db)
    context.__aexit__ = AsyncMock(return_value=False)
    factory = MagicMock(return_value=context)
    return factory, db


def make_task():
    return SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        request_json={"prompt": "test task"},
        lease_token=uuid.uuid4(),
    )


@pytest.mark.asyncio
async def test_process_once_returns_false_for_empty_queue():
    factory, db = make_session_factory()
    repository = MagicMock()
    repository.recover_expired_leases = AsyncMock(
        return_value={"requeued": 0, "failed": 0}
    )
    repository.claim_next = AsyncMock(return_value=None)

    worker = MultiAgentWorker(
        factory,
        repository=repository,
        worker_id="worker-test",
    )

    assert await worker.process_once() is False
    repository.recover_expired_leases.assert_awaited_once()
    repository.claim_next.assert_awaited_once_with(
        db,
        worker_id="worker-test",
    )


@pytest.mark.asyncio
async def test_process_once_completes_successful_task():
    factory, db = make_session_factory()
    task = make_task()
    repository = MagicMock()
    repository.recover_expired_leases = AsyncMock(
        return_value={"requeued": 0, "failed": 0}
    )
    repository.claim_next = AsyncMock(return_value=task)
    repository.complete = AsyncMock(return_value=True)
    repository.fail = AsyncMock(return_value=True)

    result = TaskResult(
        status=TaskStatus.COMPLETED,
        steps=[],
        final_output="done",
    )
    coordinator = MagicMock()
    coordinator.run = AsyncMock(return_value=result)

    worker = MultiAgentWorker(
        factory,
        repository=repository,
        coordinator_factory=lambda: coordinator,
        worker_id="worker-test",
    )

    assert await worker.process_once() is True
    repository.complete.assert_awaited_once()
    repository.fail.assert_not_awaited()

    kwargs = repository.complete.await_args.kwargs
    assert kwargs["tenant_id"] == task.tenant_id
    assert kwargs["task_id"] == task.id
    assert kwargs["worker_id"] == "worker-test"
    assert kwargs["result"]["final_output"] == "done"


@pytest.mark.asyncio
async def test_process_once_persists_coordinator_failure_once():
    factory, _ = make_session_factory()
    task = make_task()
    repository = MagicMock()
    repository.recover_expired_leases = AsyncMock(
        return_value={"requeued": 0, "failed": 0}
    )
    repository.claim_next = AsyncMock(return_value=task)
    repository.complete = AsyncMock(return_value=True)
    repository.fail = AsyncMock(return_value=True)

    result = TaskResult(
        status=TaskStatus.FAILED,
        steps=[],
        final_output=None,
    )
    coordinator = MagicMock()
    coordinator.run = AsyncMock(return_value=result)

    worker = MultiAgentWorker(
        factory,
        repository=repository,
        coordinator_factory=lambda: coordinator,
        worker_id="worker-test",
    )

    assert await worker.process_once() is True
    repository.fail.assert_awaited_once()
    repository.complete.assert_not_awaited()
    assert repository.fail.await_args.kwargs["error_code"] == (
        "task_execution_failed"
    )


@pytest.mark.asyncio
async def test_heartbeat_stops_when_lease_is_lost(monkeypatch):
    factory, _ = make_session_factory()
    repository = MagicMock()
    repository.renew_lease = AsyncMock(return_value=False)

    async def no_wait(_seconds):
        return None

    monkeypatch.setattr(asyncio, "sleep", no_wait)

    worker = MultiAgentWorker(
        factory,
        repository=repository,
        worker_id="worker-test",
    )

    await asyncio.wait_for(
        worker._heartbeat(uuid.uuid4(), uuid.uuid4()), timeout=1
    )
    repository.renew_lease.assert_awaited_once()


def test_worker_rejects_unbounded_poll_interval():
    factory, _ = make_session_factory()

    with pytest.raises(ValueError):
        MultiAgentWorker(factory, poll_interval=31)

    with pytest.raises(ValueError):
        MultiAgentWorker(factory, poll_interval=0)


def test_recovery_interval_configuration_is_bounded(monkeypatch):
    from app.multi_agent.worker import _recovery_interval_from_env

    monkeypatch.setenv("MULTI_AGENT_RECOVERY_INTERVAL_SECONDS", "20")
    assert _recovery_interval_from_env() == 20.0

    for invalid in ("abc", "0", "0.5", "301", "nan", "inf"):
        monkeypatch.setenv("MULTI_AGENT_RECOVERY_INTERVAL_SECONDS", invalid)
        with pytest.raises(ValueError):
            _recovery_interval_from_env()


@pytest.mark.asyncio
async def test_recovery_runs_once_within_interval():
    factory, db = make_session_factory()
    task = make_task()
    repository = MagicMock()
    repository.recover_expired_leases = AsyncMock(
        return_value={"requeued": 0, "failed": 0}
    )
    repository.claim_next = AsyncMock(side_effect=[None, None])
    worker = MultiAgentWorker(
        factory,
        repository=repository,
        worker_id="worker-test",
        recovery_interval=15,
    )

    assert await worker.process_once() is False
    assert await worker.process_once() is False

    repository.recover_expired_leases.assert_awaited_once_with(db)
    assert repository.claim_next.await_count == 2


@pytest.mark.asyncio
async def test_recovery_runs_again_after_interval(monkeypatch):
    import app.multi_agent.worker as worker_module

    factory, db = make_session_factory()
    repository = MagicMock()
    repository.recover_expired_leases = AsyncMock(
        return_value={"requeued": 0, "failed": 0}
    )
    repository.claim_next = AsyncMock(return_value=None)

    now = [100.0]
    monkeypatch.setattr(
        worker_module.asyncio,
        "get_running_loop",
        lambda: SimpleNamespace(time=lambda: now[0]),
    )

    worker = MultiAgentWorker(
        factory,
        repository=repository,
        worker_id="worker-test",
        recovery_interval=15,
    )

    assert await worker.process_once() is False
    now[0] = 116.0
    assert await worker.process_once() is False

    assert repository.recover_expired_leases.await_count == 2
    assert repository.claim_next.await_count == 2


@pytest.mark.asyncio
async def test_heartbeat_exception_cancels_execution_without_saving_result(
    monkeypatch,
):
    factory, _ = make_session_factory()
    task = make_task()
    repository = MagicMock()
    repository.recover_expired_leases = AsyncMock(
        return_value={"requeued": 0, "failed": 0}
    )
    repository.claim_next = AsyncMock(return_value=task)
    repository.complete = AsyncMock(return_value=True)
    repository.fail = AsyncMock(return_value=True)

    started = asyncio.Event()
    cancelled = asyncio.Event()

    coordinator = MagicMock()

    async def run_task(_request, *, on_progress=None):
        started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    coordinator.run = run_task

    worker = MultiAgentWorker(
        factory,
        repository=repository,
        coordinator_factory=lambda: coordinator,
        worker_id="worker-test",
    )

    async def failed_heartbeat(_task_id, _lease_token):
        await started.wait()
        raise RuntimeError("simulated heartbeat database failure")

    monkeypatch.setattr(worker, "_heartbeat", failed_heartbeat)

    assert await asyncio.wait_for(worker.process_once(), timeout=2) is True
    assert cancelled.is_set()
    repository.complete.assert_not_awaited()
    repository.fail.assert_not_awaited()


@pytest.mark.asyncio
async def test_result_persistence_failure_does_not_retry_terminal_write():
    factory, _ = make_session_factory()
    task = make_task()
    repository = MagicMock()
    repository.recover_expired_leases = AsyncMock(
        return_value={"requeued": 0, "failed": 0}
    )
    repository.claim_next = AsyncMock(return_value=task)
    repository.complete = AsyncMock(
        side_effect=RuntimeError("simulated result persistence failure")
    )
    repository.fail = AsyncMock(return_value=True)

    result = TaskResult(
        status=TaskStatus.COMPLETED,
        steps=[],
        final_output="done",
    )
    coordinator = MagicMock()
    coordinator.run = AsyncMock(return_value=result)

    worker = MultiAgentWorker(
        factory,
        repository=repository,
        coordinator_factory=lambda: coordinator,
        worker_id="worker-test",
    )

    assert await worker.process_once() is True
    repository.complete.assert_awaited_once()
    repository.fail.assert_not_awaited()


@pytest.mark.asyncio
async def test_process_cancellation_cleans_up_execution_and_heartbeat(
    monkeypatch,
):
    factory, _ = make_session_factory()
    task = make_task()
    repository = MagicMock()
    repository.recover_expired_leases = AsyncMock(
        return_value={"requeued": 0, "failed": 0}
    )
    repository.claim_next = AsyncMock(return_value=task)
    repository.complete = AsyncMock(return_value=True)
    repository.fail = AsyncMock(return_value=True)

    execution_started = asyncio.Event()
    execution_cancelled = asyncio.Event()
    heartbeat_started = asyncio.Event()
    heartbeat_cancelled = asyncio.Event()

    coordinator = MagicMock()

    async def run_task(_request, *, on_progress=None):
        execution_started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            execution_cancelled.set()
            raise

    coordinator.run = run_task

    worker = MultiAgentWorker(
        factory,
        repository=repository,
        coordinator_factory=lambda: coordinator,
        worker_id="worker-test",
    )

    async def wait_for_heartbeat(_task_id, _lease_token):
        heartbeat_started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            heartbeat_cancelled.set()
            raise

    monkeypatch.setattr(worker, "_heartbeat", wait_for_heartbeat)

    processing = asyncio.create_task(worker.process_once())
    await asyncio.wait_for(execution_started.wait(), timeout=1)
    await asyncio.wait_for(heartbeat_started.wait(), timeout=1)

    processing.cancel()

    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(processing, timeout=1)

    assert execution_cancelled.is_set()
    assert heartbeat_cancelled.is_set()
    repository.complete.assert_not_awaited()
    repository.fail.assert_not_awaited()

@pytest.mark.asyncio
async def test_progress_callback_persists_snapshot_under_current_lease():
    factory, _ = make_session_factory()
    task = make_task()
    repository = MagicMock()
    repository.recover_expired_leases = AsyncMock(
        return_value={"requeued": 0, "failed": 0}
    )
    repository.claim_next = AsyncMock(return_value=task)
    repository.complete = AsyncMock(return_value=True)
    repository.fail = AsyncMock(return_value=True)
    repository.update_progress = AsyncMock(return_value=True)

    result = TaskResult(
        status=TaskStatus.COMPLETED,
        steps=[],
        final_output="done",
    )
    coordinator = MagicMock()

    async def run_with_progress(_request, *, on_progress=None):
        assert on_progress is not None
        await on_progress({
            "phase": "executing",
            "steps": [
                {
                    "step_id": "write_summary",
                    "role": "executor",
                    "status": "running",
                }
            ],
        })
        return result

    coordinator.run = AsyncMock(side_effect=run_with_progress)
    worker = MultiAgentWorker(
        factory,
        repository=repository,
        coordinator_factory=lambda: coordinator,
        worker_id="worker-test",
    )

    assert await worker.process_once() is True
    repository.update_progress.assert_awaited_once()

    kwargs = repository.update_progress.await_args.kwargs
    assert kwargs["tenant_id"] == task.tenant_id
    assert kwargs["task_id"] == task.id
    assert kwargs["worker_id"] == "worker-test"
    assert kwargs["lease_token"] == task.lease_token
    assert kwargs["progress"] == {
        "phase": "executing",
        "steps": [
            {
                "step_id": "write_summary",
                "role": "executor",
                "status": "running",
            }
        ],
    }

@pytest.mark.asyncio
async def test_progress_persistence_failure_does_not_fail_task():
    factory, _ = make_session_factory()
    task = make_task()
    repository = MagicMock()
    repository.recover_expired_leases = AsyncMock(
        return_value={"requeued": 0, "failed": 0}
    )
    repository.claim_next = AsyncMock(return_value=task)
    repository.update_progress = AsyncMock(
        side_effect=RuntimeError("simulated progress database failure")
    )
    repository.complete = AsyncMock(return_value=True)
    repository.fail = AsyncMock(return_value=True)

    result = TaskResult(
        status=TaskStatus.COMPLETED,
        steps=[],
        final_output="done",
    )
    coordinator = MagicMock()

    async def run_with_progress(_request, *, on_progress=None):
        await on_progress({
            "phase": "executing",
            "steps": [
                {"step_id": "step_one", "role": "executor", "status": "running"}
            ],
        })
        await on_progress({
            "phase": "executing",
            "steps": [
                {"step_id": "step_one", "role": "executor", "status": "completed"}
            ],
        })
        return result

    coordinator.run = AsyncMock(side_effect=run_with_progress)
    worker = MultiAgentWorker(
        factory,
        repository=repository,
        coordinator_factory=lambda: coordinator,
        worker_id="worker-test",
    )

    assert await worker.process_once() is True
    repository.update_progress.assert_awaited_once()
    repository.complete.assert_awaited_once()
    repository.fail.assert_not_awaited()


@pytest.mark.asyncio
async def test_rejected_progress_update_stops_later_progress_writes():
    factory, _ = make_session_factory()
    task = make_task()
    repository = MagicMock()
    repository.recover_expired_leases = AsyncMock(
        return_value={"requeued": 0, "failed": 0}
    )
    repository.claim_next = AsyncMock(return_value=task)
    repository.update_progress = AsyncMock(return_value=False)
    repository.complete = AsyncMock(return_value=True)
    repository.fail = AsyncMock(return_value=True)

    result = TaskResult(
        status=TaskStatus.COMPLETED,
        steps=[],
        final_output="done",
    )
    coordinator = MagicMock()

    async def run_with_progress(_request, *, on_progress=None):
        await on_progress({
            "phase": "planning",
            "steps": [],
        })
        await on_progress({
            "phase": "executing",
            "steps": [
                {"step_id": "step_one", "role": "executor", "status": "running"}
            ],
        })
        return result

    coordinator.run = AsyncMock(side_effect=run_with_progress)
    worker = MultiAgentWorker(
        factory,
        repository=repository,
        coordinator_factory=lambda: coordinator,
        worker_id="worker-test",
    )

    assert await worker.process_once() is True
    repository.update_progress.assert_awaited_once()
    repository.complete.assert_awaited_once()


@pytest.mark.asyncio
async def test_progress_publishes_only_after_transaction_commit(monkeypatch):
    from app.multi_agent import progress_publisher

    events = []
    factory, _ = make_session_factory()
    task = make_task()
    repository = MagicMock()
    repository.recover_expired_leases = AsyncMock(
        return_value={"requeued": 0, "failed": 0}
    )
    repository.claim_next = AsyncMock(return_value=task)
    repository.update_progress = AsyncMock(
        side_effect=lambda *args, **kwargs: events.append("persist") or True
    )
    repository.get_relay_user_id = AsyncMock(return_value="relay-user-123")
    repository.complete = AsyncMock(return_value=True)
    repository.fail = AsyncMock(return_value=True)

    transaction = factory.return_value.__aenter__.side_effect
    # Record transaction exits so the publication ordering is observable.
    db_context = factory.return_value
    db = await db_context.__aenter__()
    db.begin.return_value.__aexit__.side_effect = (
        lambda *args, **kwargs: events.append("commit") or False
    )

    async def fake_publish(
        redis_client, *, relay_user_id, task_id, progress
    ):
        events.append("publish")
        assert relay_user_id == "relay-user-123"
        assert task_id == task.id
        assert progress["phase"] == "executing"

    monkeypatch.setattr(progress_publisher, "publish_progress", fake_publish)

    result = TaskResult(
        status=TaskStatus.COMPLETED,
        steps=[],
        final_output="done",
    )
    coordinator = MagicMock()

    async def run_with_progress(_request, *, on_progress=None):
        await on_progress({"phase": "executing", "steps": []})
        return result

    coordinator.run = AsyncMock(side_effect=run_with_progress)
    worker = MultiAgentWorker(
        factory,
        repository=repository,
        coordinator_factory=lambda: coordinator,
        worker_id="worker-test",
        redis_client=MagicMock(),
    )

    assert await worker.process_once() is True
    persist_index = events.index("persist")
    commit_index = events.index("commit", persist_index + 1)
    publish_index = events.index("publish")
    assert persist_index < commit_index < publish_index
    repository.get_relay_user_id.assert_awaited_once_with(
        db,
        tenant_id=task.tenant_id,
    )


@pytest.mark.asyncio
async def test_redis_publish_failure_does_not_stop_progress_persistence(
    monkeypatch,
):
    from app.multi_agent import progress_publisher

    factory, _ = make_session_factory()
    task = make_task()
    repository = MagicMock()
    repository.recover_expired_leases = AsyncMock(
        return_value={"requeued": 0, "failed": 0}
    )
    repository.claim_next = AsyncMock(return_value=task)
    repository.update_progress = AsyncMock(return_value=True)
    repository.get_relay_user_id = AsyncMock(return_value="relay-user-123")
    repository.complete = AsyncMock(return_value=True)
    repository.fail = AsyncMock(return_value=True)

    publish_attempts = 0

    async def fake_publish(*args, **kwargs):
        nonlocal publish_attempts
        publish_attempts += 1
        if publish_attempts == 1:
            raise ConnectionError("Redis unavailable")

    monkeypatch.setattr(progress_publisher, "publish_progress", fake_publish)

    result = TaskResult(
        status=TaskStatus.COMPLETED,
        steps=[],
        final_output="done",
    )
    coordinator = MagicMock()

    async def run_with_progress(_request, *, on_progress=None):
        await on_progress({"phase": "planning", "steps": []})
        await on_progress({"phase": "executing", "steps": []})
        return result

    coordinator.run = AsyncMock(side_effect=run_with_progress)
    worker = MultiAgentWorker(
        factory,
        repository=repository,
        coordinator_factory=lambda: coordinator,
        worker_id="worker-test",
        redis_client=MagicMock(),
    )

    assert await worker.process_once() is True
    assert repository.update_progress.await_count == 2
    assert repository.get_relay_user_id.await_count == 2
    assert publish_attempts == 2
    repository.complete.assert_awaited_once()
