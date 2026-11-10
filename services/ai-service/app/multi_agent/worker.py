"""Durable multi-agent worker with bounded polling and lease heartbeats."""

import asyncio
import json
import logging
from datetime import datetime, timezone
import os
import signal
import socket
import uuid
from collections.abc import Callable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.exc import DBAPIError

from app.db.session import AsyncSessionLocal
from app.multi_agent.agents import (
    AnalystAgent,
    ExecutorAgent,
    MemoryAgent,
    PlannerAgent,
    ResearcherAgent,
    ReviewerAgent,
    WriterAgent,
)
from app.multi_agent.contracts import (
    MAX_STEP_OUTPUT_CHARS,
    AgentRole,
    TaskRequest,
    TaskStatus,
)
from app.multi_agent.coordinator import MultiAgentCoordinator
from app.multi_agent.provider_factory import get_multi_agent_providers
from app.multi_agent.repository import (
    LEASE_SECONDS,
    MultiAgentTaskRepository,
    task_repository,
)

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 1.0
HEARTBEAT_INTERVAL_SECONDS = max(1.0, LEASE_SECONDS / 3)
HEARTBEAT_DB_RETRY_DELAYS_SECONDS = (1.0, 2.0, 4.0)
MAX_POLL_INTERVAL_SECONDS = 30.0
RECOVERY_INTERVAL_SECONDS = 15.0
MAX_RECOVERY_INTERVAL_SECONDS = 300.0
PROCESS_HEARTBEAT_KEY = "multi-agent-worker:heartbeat"
PROCESS_HEARTBEAT_INTERVAL_SECONDS = 5
PROCESS_HEARTBEAT_TTL_SECONDS = 15


def _recovery_interval_from_env() -> float:
    raw_value = os.getenv(
        "MULTI_AGENT_RECOVERY_INTERVAL_SECONDS",
        str(RECOVERY_INTERVAL_SECONDS),
    )
    try:
        interval = float(raw_value)
    except ValueError as exc:
        raise ValueError(
            "MULTI_AGENT_RECOVERY_INTERVAL_SECONDS must be numeric"
        ) from exc

    if not 1.0 <= interval <= MAX_RECOVERY_INTERVAL_SECONDS:
        raise ValueError(
            "MULTI_AGENT_RECOVERY_INTERVAL_SECONDS must be between 1 and 300"
        )
    return interval


def build_coordinator(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    tenant_id: uuid.UUID,
) -> MultiAgentCoordinator:
    """Build a tenant-aware coordinator with isolated memory retrieval."""
    providers = get_multi_agent_providers()

    async def retrieve_memory(step, dependency_outputs: dict[str, str]) -> str:
        memory_agent = MemoryAgent()
        async with session_factory() as db:
            chunks = await memory_agent.retrieve(
                db,
                tenant_id=tenant_id,
                query=step.objective,
            )

        evidence: list[dict[str, Any]] = []
        payload = json.dumps({"evidence": evidence}, ensure_ascii=False)

        for chunk in chunks:
            candidate = {
                "chunk_id": str(chunk.chunk_id),
                "document_id": str(chunk.document_id),
                "title": chunk.title[:200],
                "source_uri": chunk.source_uri[:500] if chunk.source_uri else None,
                "chunk_index": chunk.chunk_index,
                "start": chunk.start,
                "end": chunk.end,
                "score": chunk.score,
                "content": chunk.content[:1000],
            }
            proposed = json.dumps(
                {"evidence": [*evidence, candidate]},
                ensure_ascii=False,
            )
            if len(proposed) > MAX_STEP_OUTPUT_CHARS:
                break
            evidence.append(candidate)
            payload = proposed

        return payload

    return MultiAgentCoordinator(
        PlannerAgent(providers.planner).plan,
        ExecutorAgent(providers.executor).execute,
        ReviewerAgent(providers.reviewer).review,
        role_executors={
            AgentRole.RESEARCHER: ResearcherAgent(providers.researcher).research,
            AgentRole.ANALYST: AnalystAgent(providers.analyst).analyze,
            AgentRole.WRITER: WriterAgent(providers.writer).write,
            AgentRole.MEMORY: retrieve_memory,
        },
    )



def _is_transient_database_connection_error(error: DBAPIError) -> bool:
    if error.connection_invalidated:
        return True

    pending = [error.orig]
    seen: set[int] = set()

    while pending:
        current = pending.pop()
        if current is None or id(current) in seen:
            continue
        seen.add(id(current))

        sqlstate = getattr(current, "sqlstate", None)
        if not isinstance(sqlstate, str):
            sqlstate = getattr(current, "pgcode", None)

        if isinstance(sqlstate, str) and (
            sqlstate.startswith("08")
            or sqlstate in {"57P01", "57P02", "57P03"}
        ):
            return True

        if type(current).__name__ in {
            "ConnectionDoesNotExistError",
            "CannotConnectNowError",
            "ConnectionFailureError",
        }:
            return True

        pending.extend(
            getattr(current, attribute, None)
            for attribute in ("orig", "__cause__", "__context__")
        )

    return False


class MultiAgentWorker:
    """Execute durable tasks outside database transactions."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        *,
        repository: MultiAgentTaskRepository = task_repository,
        coordinator_factory: Callable[[], MultiAgentCoordinator] | None = None,
        worker_id: str | None = None,
        redis_client: Any | None = None,
        poll_interval: float = POLL_INTERVAL_SECONDS,
        recovery_interval: float | None = None,
    ) -> None:
        if not 0 < poll_interval <= MAX_POLL_INTERVAL_SECONDS:
            raise ValueError("poll_interval is outside the allowed range")

        if recovery_interval is None:
            recovery_interval = _recovery_interval_from_env()
        if not 1.0 <= recovery_interval <= MAX_RECOVERY_INTERVAL_SECONDS:
            raise ValueError("recovery_interval must be between 1 and 300")

        self._session_factory = session_factory
        self._repository = repository
        self._coordinator_factory = coordinator_factory
        self._redis_client = redis_client
        self._worker_id = worker_id or (
            f"{socket.gethostname()}-{uuid.uuid4().hex[:16]}"
        )
        if not self._worker_id or len(self._worker_id) > 100:
            raise ValueError("worker_id must contain 1 to 100 characters")

        self._poll_interval = poll_interval
        self._recovery_interval = recovery_interval
        self._next_recovery_at = 0.0
        self._stopping = asyncio.Event()
        self._health_state = "starting"
        self._last_poll_at: str | None = None
        self._last_poll_error: str | None = None

    async def _publish_process_heartbeat(self) -> None:
        if self._redis_client is None:
            return

        payload = {
            "worker": "multi-agent-worker",
            "worker_id": self._worker_id,
            "status": self._health_state,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "last_poll_at": self._last_poll_at,
            "last_poll_error": self._last_poll_error,
        }
        await self._redis_client.set(
            PROCESS_HEARTBEAT_KEY,
            json.dumps(payload),
            ex=PROCESS_HEARTBEAT_TTL_SECONDS,
        )

    async def _run_process_heartbeat(self) -> None:
        while not self._stopping.is_set():
            try:
                await self._publish_process_heartbeat()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("multi_agent_process_heartbeat_failed")
                return

            try:
                await asyncio.wait_for(
                    self._stopping.wait(),
                    timeout=PROCESS_HEARTBEAT_INTERVAL_SECONDS,
                )
            except TimeoutError:
                pass

    def stop(self) -> None:
        """Request a graceful stop after the current task."""
        self._stopping.set()

    async def run_forever(self) -> None:
        """Poll until shutdown is requested; never spin on an empty queue."""
        logger.info("multi_agent_worker_started")
        heartbeat_task = None
        if self._redis_client is not None:
            heartbeat_task = asyncio.create_task(
                self._run_process_heartbeat(),
                name="multi-agent-process-heartbeat",
            )

        try:
            while not self._stopping.is_set():
                try:
                    self._health_state = "processing"
                    processed = await self.process_once()
                    self._last_poll_at = datetime.now(timezone.utc).isoformat()
                    self._last_poll_error = None
                    self._health_state = "idle"
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    self._health_state = "degraded"
                    self._last_poll_error = type(exc).__name__
                    logger.exception("multi_agent_worker_iteration_failed")
                    processed = False

                if not processed and not self._stopping.is_set():
                    try:
                        await asyncio.wait_for(
                            self._stopping.wait(),
                            timeout=self._poll_interval,
                        )
                    except TimeoutError:
                        pass
        finally:
            self._health_state = "stopping"
            self._stopping.set()
            if heartbeat_task is not None:
                heartbeat_task.cancel()
                try:
                    await heartbeat_task
                except asyncio.CancelledError:
                    pass
            if self._redis_client is not None:
                try:
                    await self._redis_client.delete(PROCESS_HEARTBEAT_KEY)
                except Exception:
                    logger.exception("multi_agent_process_heartbeat_cleanup_failed")
            logger.info("multi_agent_worker_stopped")

    async def process_once(self) -> bool:
        """Claim and process one task; return False if the queue is empty."""
        async with self._session_factory() as db:
            async with db.begin():
                now = asyncio.get_running_loop().time()
                if now >= self._next_recovery_at:
                    recovered = await self._repository.recover_expired_leases(
                        db,
                    )
                    self._next_recovery_at = (
                        now + self._recovery_interval
                    )
                    if recovered["requeued"] or recovered["failed"]:
                        logger.info(
                            "multi_agent_expired_leases_recovered",
                            extra=recovered,
                        )

                task = await self._repository.claim_next(
                    db,
                    worker_id=self._worker_id,
                )
                if task is None:
                    return False

                task_id = task.id
                tenant_id = task.tenant_id
                request_data = dict(task.request_json)
                lease_token = task.lease_token
                if lease_token is None:
                    raise RuntimeError(
                        "Claimed multi-agent task has no lease token"
                    )

        logger.info(
            "multi_agent_task_claimed",
            extra={"task_id": str(task_id), "worker_id": self._worker_id},
        )

        execution = asyncio.create_task(
            self._execute(
                task_id,
                tenant_id,
                request_data,
                lease_token,
            ),
            name=f"multi-agent-{task_id}",
        )
        heartbeat = asyncio.create_task(
            self._heartbeat(task_id, lease_token),
            name=f"multi-agent-heartbeat-{task_id}",
        )

        try:
            done, _ = await asyncio.wait(
                {execution, heartbeat},
                return_when=asyncio.FIRST_COMPLETED,
            )

            if heartbeat in done:
                # Never publish a result after lease loss or heartbeat failure.
                try:
                    heartbeat.result()
                except asyncio.CancelledError:
                    pass
                except Exception:
                    logger.exception(
                        "multi_agent_heartbeat_failed",
                        extra={"task_id": str(task_id)},
                    )

                if not execution.done():
                    execution.cancel()
                await asyncio.gather(execution, return_exceptions=True)
                return True

            # Handle execution errors separately from database persistence
            # errors. A failed result write must not trigger a second
            # terminal-state write.
            try:
                result = execution.result()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception(
                    "multi_agent_task_execution_failed",
                    extra={"task_id": str(task_id)},
                )
                try:
                    async with self._session_factory() as db:
                        async with db.begin():
                            await self._repository.fail(
                                db,
                                tenant_id=tenant_id,
                                task_id=task_id,
                                worker_id=self._worker_id,
                                lease_token=lease_token,
                                error_code="task_execution_failed",
                            )
                except asyncio.CancelledError:
                    raise
                except Exception:
                    logger.exception(
                        "multi_agent_task_failure_persistence_failed",
                        extra={"task_id": str(task_id)},
                    )
                return True

            try:
                async with self._session_factory() as db:
                    async with db.begin():
                        if result.get("status") == TaskStatus.COMPLETED.value:
                            saved = await self._repository.complete(
                                db,
                                tenant_id=tenant_id,
                                task_id=task_id,
                                worker_id=self._worker_id,
                                lease_token=lease_token,
                                result=result,
                            )
                        else:
                            saved = await self._repository.fail(
                                db,
                                tenant_id=tenant_id,
                                task_id=task_id,
                                worker_id=self._worker_id,
                                lease_token=lease_token,
                                error_code="task_execution_failed",
                                result=result,
                            )
            except asyncio.CancelledError:
                raise
            except Exception:
                # Leave the task to lease recovery. Do not attempt another
                # terminal transition after a persistence failure.
                logger.exception(
                    "multi_agent_result_persistence_failed",
                    extra={"task_id": str(task_id)},
                )
                return True

            if not saved:
                logger.warning(
                    "multi_agent_result_discarded_lost_lease",
                    extra={"task_id": str(task_id)},
                )

            return True
        finally:
            # Clean up both child tasks if this worker iteration is cancelled
            # during shutdown or by its caller.
            for child in (execution, heartbeat):
                if not child.done():
                    child.cancel()

            await asyncio.gather(
                execution,
                heartbeat,
                return_exceptions=True,
            )

    async def _execute(
        self,
        task_id: uuid.UUID,
        tenant_id: uuid.UUID,
        request_data: dict[str, Any],
        lease_token: uuid.UUID,
    ) -> dict[str, Any]:
        request = TaskRequest.model_validate(request_data)
        if self._coordinator_factory is None:
            coordinator = build_coordinator(
                session_factory=self._session_factory,
                tenant_id=tenant_id,
            )
        else:
            coordinator = self._coordinator_factory()
        progress_enabled = True

        async def on_progress(snapshot: dict[str, Any]) -> None:
            nonlocal progress_enabled

            if not progress_enabled:
                return

            relay_user_id = None
            try:
                async with self._session_factory() as db:
                    async with db.begin():
                        saved = await self._repository.update_progress(
                            db,
                            tenant_id=tenant_id,
                            task_id=task_id,
                            worker_id=self._worker_id,
                            lease_token=lease_token,
                            progress=snapshot,
                        )
                        if saved and self._redis_client is not None:
                            relay_user_id = (
                                await self._repository.get_relay_user_id(
                                    db,
                                    tenant_id=tenant_id,
                                )
                            )
            except asyncio.CancelledError:
                raise
            except Exception:
                # Persistence is best-effort. A database error disables
                # further writes for this lease; Redis errors do not.
                progress_enabled = False
                logger.warning(
                    "multi_agent_progress_persistence_failed",
                    extra={"task_id": str(task_id)},
                    exc_info=True,
                )
                return

            # The transaction has committed before any Redis publication.
            if not saved:
                progress_enabled = False
                logger.info(
                    "multi_agent_progress_discarded_lost_lease",
                    extra={"task_id": str(task_id)},
                )
                return

            if relay_user_id:
                from app.multi_agent.progress_publisher import publish_progress

                try:
                    await publish_progress(
                        self._redis_client,
                        relay_user_id=relay_user_id,
                        task_id=task_id,
                        progress=snapshot,
                    )
                except asyncio.CancelledError:
                    raise
                except Exception:
                    # Realtime delivery is best-effort. Keep persisting
                    # snapshots so clients can recover from durable state.
                    logger.warning(
                        "multi_agent_progress_publish_failed",
                        extra={"task_id": str(task_id)},
                        exc_info=True,
                    )

        result = await coordinator.run(request, on_progress=on_progress)
        payload = result.model_dump(mode="json")

        # The caller owns the single terminal database transition.
        # Keep provider exceptions and credentials out of persisted records.
        return payload

    async def _heartbeat(
        self,
        task_id: uuid.UUID,
        lease_token: uuid.UUID,
    ) -> None:
        """Renew the lease, briefly retrying transient database connection failures."""
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)

            for attempt in range(len(HEARTBEAT_DB_RETRY_DELAYS_SECONDS) + 1):
                try:
                    async with self._session_factory() as db:
                        async with db.begin():
                            renewed = await self._repository.renew_lease(
                                db,
                                task_id=task_id,
                                worker_id=self._worker_id,
                                lease_token=lease_token,
                            )
                    break

                except DBAPIError as exc:
                    if (
                        not _is_transient_database_connection_error(exc)
                        or attempt >= len(HEARTBEAT_DB_RETRY_DELAYS_SECONDS)
                    ):
                        raise

                    retry_delay = HEARTBEAT_DB_RETRY_DELAYS_SECONDS[attempt]
                    logger.warning(
                        "multi_agent_heartbeat_database_retry",
                        extra={
                            "task_id": str(task_id),
                            "attempt": attempt + 1,
                            "retry_delay_seconds": retry_delay,
                        },
                        exc_info=True,
                    )
                    await asyncio.sleep(retry_delay)

            if not renewed:
                logger.warning(
                    "multi_agent_task_lease_lost",
                    extra={"task_id": str(task_id)},
                )
                return

async def main() -> None:
    """Run the worker with graceful SIGINT and SIGTERM handling."""
    loop = asyncio.get_running_loop()
    redis_client = None
    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        from redis.asyncio import Redis

        redis_client = Redis.from_url(redis_url, decode_responses=True)
    worker = MultiAgentWorker(
        AsyncSessionLocal,
        redis_client=redis_client,
    )
    registered_signals: list[signal.Signals] = []

    def request_stop() -> None:
        logger.info("multi_agent_worker_shutdown_requested")
        worker.stop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, request_stop)
        except (NotImplementedError, RuntimeError):
            # Some event-loop implementations do not support signal handlers.
            logger.warning(
                "multi_agent_signal_handler_unavailable",
                extra={"signal": sig.name},
            )
        else:
            registered_signals.append(sig)

    try:
        await worker.run_forever()
    finally:
        worker.stop()
        if redis_client is not None:
            await redis_client.aclose()
        for sig in registered_signals:
            loop.remove_signal_handler(sig)


if __name__ == "__main__":
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    asyncio.run(main())
