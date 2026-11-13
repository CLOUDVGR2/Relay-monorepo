"""Dedicated worker for call recording transcription and summarization."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import signal
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.db.ssl import database_connect_args
from app.recordings.ai_client import analyze_conversation
from app.recordings.repository import (
    ClaimedRecordingJob,
    RecordingJobRepository,
    RecordingTrack,
)
from app.recordings.storage import RecordingStorage
from app.recordings.transcription import RecordingTranscriber
from app.schemas.conversation_analysis import (
    ConversationAnalysisMessage,
    ConversationAnalysisRequest,
)

logger = logging.getLogger("recording_worker")

LEASE_SECONDS = int(os.getenv("RECORDING_JOB_LEASE_SECONDS", "120"))
HEARTBEAT_SECONDS = int(os.getenv("RECORDING_JOB_HEARTBEAT_SECONDS", "40"))
MAX_ATTEMPTS = int(os.getenv("RECORDING_JOB_MAX_ATTEMPTS", "3"))
RETRY_DELAY_SECONDS = int(os.getenv("RECORDING_JOB_RETRY_DELAY_SECONDS", "30"))
POLL_SECONDS = float(os.getenv("RECORDING_WORKER_POLL_SECONDS", "3"))
PROCESS_HEARTBEAT_KEY = "recording-worker:heartbeat"
PROCESS_HEARTBEAT_INTERVAL_SECONDS = 5
PROCESS_HEARTBEAT_TTL_SECONDS = 15

LOCAL_KIND = "LOCAL_MICROPHONE"
REMOTE_KIND = "REMOTE_PARTICIPANT"
EXPECTED_KINDS = {LOCAL_KIND, REMOTE_KIND}

FAILURE_CODES = {
    "TRACK_NOT_FOUND",
    "TRACK_INTEGRITY_FAILED",
    "AUDIO_DOWNLOAD_FAILED",
    "TRANSCRIPTION_FAILED",
    "TRANSCRIPTION_EMPTY",
    "TRANSCRIPT_TOO_LONG",
    "ANALYSIS_FAILED",
    "MAX_ATTEMPTS_EXCEEDED",
}


class ProcessingFailure(RuntimeError):
    def __init__(self, code: str) -> None:
        if code not in FAILURE_CODES:
            raise ValueError("Unknown recording processing failure code")
        super().__init__(code)
        self.code = code


class LeaseLost(RuntimeError):
    """This worker no longer owns the recording job."""


@dataclass(frozen=True, slots=True)
class WorkerConfig:
    database_url: str
    lease_seconds: int = LEASE_SECONDS
    heartbeat_seconds: int = HEARTBEAT_SECONDS
    max_attempts: int = MAX_ATTEMPTS
    retry_delay_seconds: int = RETRY_DELAY_SECONDS
    poll_seconds: float = POLL_SECONDS

    @classmethod
    def from_environment(cls) -> WorkerConfig:
        database_url = os.getenv("DATABASE_URL", "").strip()
        if not database_url:
            raise RuntimeError("DATABASE_URL is required by the recording worker")

        if database_url.startswith("postgres://"):
            database_url = "postgresql+asyncpg://" + database_url[len("postgres://"):]
        elif database_url.startswith("postgresql://"):
            database_url = "postgresql+asyncpg://" + database_url[len("postgresql://"):]

        config = cls(database_url=database_url)

        if config.lease_seconds < 10:
            raise ValueError("RECORDING_JOB_LEASE_SECONDS must be at least 10")
        if not 1 <= config.heartbeat_seconds < config.lease_seconds:
            raise ValueError(
                "RECORDING_JOB_HEARTBEAT_SECONDS must be positive "
                "and less than the lease duration"
            )
        if config.max_attempts < 1:
            raise ValueError("RECORDING_JOB_MAX_ATTEMPTS must be positive")
        if config.retry_delay_seconds < 0:
            raise ValueError("RECORDING_JOB_RETRY_DELAY_SECONDS cannot be negative")
        if config.poll_seconds <= 0:
            raise ValueError("RECORDING_WORKER_POLL_SECONDS must be positive")

        return config


def _verify_audio_file(path: Path, track: RecordingTrack) -> None:
    if not path.is_file():
        raise ProcessingFailure("AUDIO_DOWNLOAD_FAILED")

    digest = hashlib.sha256()
    actual_size = 0

    with path.open("rb") as audio_file:
        while chunk := audio_file.read(1024 * 1024):
            actual_size += len(chunk)
            digest.update(chunk)

    if actual_size != track.byte_size:
        raise ProcessingFailure("TRACK_INTEGRITY_FAILED")

    expected_hash = track.sha256.lower().strip()
    if not re.fullmatch(r"[0-9a-f]{64}", expected_hash):
        raise ProcessingFailure("TRACK_INTEGRITY_FAILED")

    if digest.hexdigest() != expected_hash:
        raise ProcessingFailure("TRACK_INTEGRITY_FAILED")


def _download_and_transcribe(
    storage: RecordingStorage,
    transcriber: RecordingTranscriber,
    track: RecordingTrack,
):
    """Run blocking S3 download, integrity verification, and Whisper inference."""
    try:
        with storage.download_to_tempfile(track.object_key) as audio_path:
            _verify_audio_file(audio_path, track)

            try:
                return transcriber.transcribe_file(audio_path)
            except Exception as exc:
                raise ProcessingFailure("TRANSCRIPTION_FAILED") from exc
    except ProcessingFailure:
        raise
    except Exception as exc:
        raise ProcessingFailure("AUDIO_DOWNLOAD_FAILED") from exc


def _build_analysis_messages(
    local_text: str,
    remote_text: str,
) -> list[ConversationAnalysisMessage]:
    """Split transcripts into bounded messages without truncating content."""
    messages: list[ConversationAnalysisMessage] = []

    for sender, transcript in (
        ("Local participant", local_text),
        ("Remote participant", remote_text),
    ):
        remaining = transcript.strip()
        while remaining:
            if len(remaining) <= 4800:
                chunk = remaining
                remaining = ""
            else:
                split_at = remaining.rfind(" ", 0, 4800)
                if split_at <= 0:
                    split_at = 4800
                chunk = remaining[:split_at].strip()
                remaining = remaining[split_at:].strip()

            if chunk:
                messages.append(
                    ConversationAnalysisMessage(sender=sender, text=chunk)
                )

    if not messages:
        raise ProcessingFailure("TRANSCRIPTION_EMPTY")

    try:
        # Apply the same limits as the existing API request schema.
        validated = ConversationAnalysisRequest(messages=messages)
    except Exception as exc:
        raise ProcessingFailure("TRANSCRIPT_TOO_LONG") from exc

    return validated.messages


class RecordingWorker:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        repository: RecordingJobRepository,
        storage: RecordingStorage,
        transcriber: RecordingTranscriber,
        config: WorkerConfig,
        redis_client: Any | None = None,
    ) -> None:
        self.session_factory = session_factory
        self.repository = repository
        self.storage = storage
        self.transcriber = transcriber
        self.config = config
        self.redis_client = redis_client
        self.stopping = asyncio.Event()
        self._health_state = "starting"
        self._last_poll_at: str | None = None
        self._last_poll_error: str | None = None

    def request_stop(self) -> None:
        self.stopping.set()

    async def _renew_lease(self, job: ClaimedRecordingJob) -> bool:
        async with self.session_factory() as db:
            async with db.begin():
                return await self.repository.renew_lease(
                    db,
                    job_id=job.id,
                    lease_token=job.lease_token,
                    lease_seconds=self.config.lease_seconds,
                )

    async def _heartbeat(
        self,
        job: ClaimedRecordingJob,
        lost_lease: asyncio.Event,
    ) -> None:
        while True:
            await asyncio.sleep(self.config.heartbeat_seconds)

            try:
                renewed = await self._renew_lease(job)
            except Exception:
                logger.exception(
                    "Recording lease renewal failed; job_id=%s",
                    job.id,
                )
                lost_lease.set()
                return

            if not renewed:
                logger.warning(
                    "Recording lease is no longer owned; job_id=%s",
                    job.id,
                )
                lost_lease.set()
                return

    async def _save_transcript(
        self,
        job: ClaimedRecordingJob,
        track: RecordingTrack,
        text: str,
        language: str | None,
    ) -> None:
        async with self.session_factory() as db:
            async with db.begin():
                saved = await self.repository.save_transcript(
                    db,
                    job_id=job.id,
                    recording_id=job.recording_id,
                    track_id=track.id,
                    lease_token=job.lease_token,
                    transcript_text=text,
                    language=language,
                    lease_seconds=self.config.lease_seconds,
                )
                if not saved:
                    raise LeaseLost("Recording lease lost before transcript save")

    async def _finalize(
        self,
        job: ClaimedRecordingJob,
        summary: str,
        key_points: list[str],
        action_items: list[dict[str, Any]],
    ) -> None:
        # Summary persistence and job completion must commit or roll back together.
        async with self.session_factory() as db:
            async with db.begin():
                saved = await self.repository.save_summary(
                    db,
                    job_id=job.id,
                    recording_id=job.recording_id,
                    call_id=job.call_id,
                    lease_token=job.lease_token,
                    summary_text=summary,
                    key_points=key_points,
                    action_items=action_items,
                    lease_seconds=self.config.lease_seconds,
                )
                if not saved:
                    raise LeaseLost("Recording lease lost before summary save")

                completed = await self.repository.complete(
                    db,
                    job_id=job.id,
                    lease_token=job.lease_token,
                    lease_seconds=self.config.lease_seconds,
                )
                if not completed:
                    raise LeaseLost("Recording lease lost before job completion")

    async def _record_failure(
        self,
        job: ClaimedRecordingJob,
        failure_code: str,
    ) -> None:
        async with self.session_factory() as db:
            async with db.begin():
                updated = await self.repository.retry_or_fail(
                    db,
                    job_id=job.id,
                    lease_token=job.lease_token,
                    attempts=job.attempts,
                    failure_code=failure_code,
                    lease_seconds=self.config.lease_seconds,
                    max_attempts=self.config.max_attempts,
                    retry_delay_seconds=self.config.retry_delay_seconds,
                )

        if updated:
            logger.warning(
                "Recording job failed; job_id=%s code=%s attempt=%s",
                job.id,
                failure_code,
                job.attempts,
            )
        else:
            logger.warning(
                "Could not update failed job because its lease is no longer valid; "
                "job_id=%s",
                job.id,
            )

    async def process(self, job: ClaimedRecordingJob) -> None:
        lost_lease = asyncio.Event()
        heartbeat = asyncio.create_task(self._heartbeat(job, lost_lease))

        try:
            async with self.session_factory() as db:
                tracks = await self.repository.load_tracks(
                    db,
                    job_id=job.id,
                    recording_id=job.recording_id,
                    lease_token=job.lease_token,
                    lease_seconds=self.config.lease_seconds,
                )

            if lost_lease.is_set():
                raise LeaseLost("Lease lost while loading recording tracks")

            if len(tracks) != 2:
                raise ProcessingFailure("TRACK_NOT_FOUND")

            by_kind = {track.kind: track for track in tracks}
            if len(by_kind) != 2 or set(by_kind) != EXPECTED_KINDS:
                raise ProcessingFailure("TRACK_NOT_FOUND")

            for track in tracks:
                if (
                    track.content_type.lower() != "audio/wav"
                    or not track.object_key.strip()
                    or track.duration_ms <= 0
                    or track.byte_size <= 0
                ):
                    raise ProcessingFailure("TRACK_NOT_FOUND")

            transcripts: dict[str, str] = {}

            # Keep model inference sequential to bound memory use on small machines.
            for kind in (LOCAL_KIND, REMOTE_KIND):
                track = by_kind[kind]
                result = await asyncio.to_thread(
                    _download_and_transcribe,
                    self.storage,
                    self.transcriber,
                    track,
                )

                if lost_lease.is_set():
                    raise LeaseLost("Lease lost during audio transcription")

                transcripts[kind] = result.text.strip()

                await self._save_transcript(
                    job,
                    track,
                    transcripts[kind],
                    result.language,
                )

                if lost_lease.is_set():
                    raise LeaseLost("Lease lost after transcript persistence")

            messages = _build_analysis_messages(
                transcripts[LOCAL_KIND],
                transcripts[REMOTE_KIND],
            )

            try:
                analysis = await analyze_conversation(messages)
            except Exception as exc:
                logger.warning(
                    "Conversation analysis failed; job_id=%s",
                    job.id,
                    exc_info=False,
                )
                raise ProcessingFailure("ANALYSIS_FAILED") from exc

            if lost_lease.is_set():
                raise LeaseLost("Lease lost during conversation analysis")

            action_items = [
                item.model_dump(mode="json")
                for item in analysis.action_items
            ]

            await self._finalize(
                job,
                analysis.summary,
                analysis.decisions,
                action_items,
            )

            logger.info("Recording job completed; job_id=%s", job.id)

        except LeaseLost:
            logger.warning(
                "Stopping processing because lease ownership was lost; job_id=%s",
                job.id,
            )
        except ProcessingFailure as exc:
            if not lost_lease.is_set():
                await self._record_failure(job, exc.code)
        except Exception:
            logger.exception("Unexpected recording worker failure; job_id=%s", job.id)
            if not lost_lease.is_set():
                await self._record_failure(job, "TRANSCRIPTION_FAILED")
        finally:
            heartbeat.cancel()
            try:
                await heartbeat
            except asyncio.CancelledError:
                pass

    async def _publish_process_heartbeat(self) -> None:
        if self.redis_client is None:
            return

        payload = {
            "worker": "recording-worker",
            "status": self._health_state,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "last_poll_at": self._last_poll_at,
            "last_poll_error": self._last_poll_error,
        }
        await self.redis_client.set(
            PROCESS_HEARTBEAT_KEY,
            json.dumps(payload),
            ex=PROCESS_HEARTBEAT_TTL_SECONDS,
        )

    async def _run_process_heartbeat(self) -> None:
        while not self.stopping.is_set():
            try:
                await self._publish_process_heartbeat()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception(
                    "Recording worker process heartbeat failed; retrying in 5 seconds"
                )
                try:
                    await asyncio.wait_for(
                        self.stopping.wait(),
                        timeout=5,
                    )
                except TimeoutError:
                    pass
                continue

            try:
                await asyncio.wait_for(
                    self.stopping.wait(),
                    timeout=PROCESS_HEARTBEAT_INTERVAL_SECONDS,
                )
            except TimeoutError:
                pass

    async def run(self) -> None:
        logger.info("Recording worker started")
        heartbeat_task = (
            asyncio.create_task(self._run_process_heartbeat())
            if self.redis_client is not None
            else None
        )

        try:
            while not self.stopping.is_set():
                try:
                    async with self.session_factory() as db:
                        async with db.begin():
                            await self.repository.fail_exhausted_jobs(
                                db,
                                lease_seconds=self.config.lease_seconds,
                                max_attempts=self.config.max_attempts,
                            )

                            job = await self.repository.claim_next(
                                db,
                                lease_seconds=self.config.lease_seconds,
                                max_attempts=self.config.max_attempts,
                            )

                    self._last_poll_at = datetime.now(timezone.utc).isoformat()
                    self._last_poll_error = None
                    self._health_state = "processing" if job is not None else "idle"

                    if job is not None:
                        await self.process(job)
                        self._health_state = "idle"
                        continue

                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    self._health_state = "degraded"
                    self._last_poll_error = type(exc).__name__
                    logger.exception("Recording worker polling cycle failed")

                try:
                    await asyncio.wait_for(
                        self.stopping.wait(),
                        timeout=self.config.poll_seconds,
                    )
                except TimeoutError:
                    pass
        finally:
            self.stopping.set()

            if heartbeat_task is not None:
                heartbeat_task.cancel()
                try:
                    await heartbeat_task
                except asyncio.CancelledError:
                    pass

            if self.redis_client is not None:
                try:
                    await self.redis_client.delete(PROCESS_HEARTBEAT_KEY)
                except Exception:
                    logger.exception("Could not remove recording worker heartbeat")

            logger.info("Recording worker stopped")


async def main() -> None:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    config = WorkerConfig.from_environment()

    engine = create_async_engine(
        config.database_url,
        connect_args=database_connect_args(),
        pool_pre_ping=True,
        pool_size=1,
        max_overflow=0,
    )
    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        raise RuntimeError("REDIS_URL is required for the recording worker")

    from redis.asyncio import Redis

    redis_client = Redis.from_url(redis_url, decode_responses=True)

    try:
        storage = RecordingStorage()
        transcriber = RecordingTranscriber()
        worker = RecordingWorker(
            session_factory=session_factory,
            repository=RecordingJobRepository(),
            storage=storage,
            transcriber=transcriber,
            config=config,
            redis_client=redis_client,
        )

        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, worker.request_stop)
            except NotImplementedError:
                pass

        await worker.run()
    finally:
        await redis_client.aclose()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
