"""Durable PostgreSQL repository for call recording processing jobs."""

import json
import uuid
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True, slots=True)
class ClaimedRecordingJob:
    id: uuid.UUID
    recording_id: uuid.UUID
    call_id: uuid.UUID
    lease_token: str
    attempts: int


@dataclass(frozen=True, slots=True)
class RecordingTrack:
    id: uuid.UUID
    kind: str
    object_key: str
    content_type: str
    duration_ms: int
    byte_size: int
    sha256: str


class RecordingJobRepository:
    """Atomic job claiming and lease management."""

    async def load_tracks(
        self,
        db: AsyncSession,
        *,
        job_id: uuid.UUID,
        recording_id: uuid.UUID,
        lease_token: str,
        lease_seconds: int = 120,
    ) -> list[RecordingTrack]:
        """Load tracks only while this worker still owns a valid lease."""
        result = await db.execute(
            text(
                """
                SELECT
                    t."id",
                    t."kind",
                    t."objectKey",
                    t."contentType",
                    t."durationMs",
                    t."byteSize",
                    t."sha256"
                FROM "call_recording_tracks" AS t
                WHERE
                    t."recordingId" = :recording_id
                    AND EXISTS (
                        SELECT 1
                        FROM "call_processing_jobs" AS j
                        WHERE
                            j."id" = :job_id
                            AND j."recordingId" = :recording_id
                            AND j."status" = 'RUNNING'
                            AND j."leaseToken" = :lease_token
                            AND j."lockedAt" > NOW() - (
                                :lease_seconds * INTERVAL '1 second'
                            )
                    )
                ORDER BY t."kind"
                """
            ),
            {
                "job_id": job_id,
                "recording_id": recording_id,
                "lease_token": lease_token,
                "lease_seconds": lease_seconds,
            },
        )

        return [
            RecordingTrack(
                id=row["id"],
                kind=row["kind"],
                object_key=row["objectKey"],
                content_type=row["contentType"],
                duration_ms=row["durationMs"],
                byte_size=row["byteSize"],
                sha256=row["sha256"],
            )
            for row in result.mappings().all()
        ]

    async def save_transcript(
        self,
        db: AsyncSession,
        *,
        job_id: uuid.UUID,
        recording_id: uuid.UUID,
        track_id: uuid.UUID,
        lease_token: str,
        transcript_text: str,
        language: str | None,
        lease_seconds: int = 120,
    ) -> bool:
        """Persist a transcript only while this worker owns a valid lease."""
        result = await db.execute(
            text(
                """
                WITH valid_lease AS (
                    SELECT j."id"
                    FROM "call_processing_jobs" AS j
                    WHERE
                        j."id" = :job_id
                        AND j."recordingId" = :recording_id
                        AND j."status" = 'RUNNING'
                        AND j."leaseToken" = :lease_token
                        AND j."lockedAt" > NOW() - (
                            :lease_seconds * INTERVAL '1 second'
                        )
                ),
                saved AS (
                    INSERT INTO "call_transcripts" (
                        "id",
                        "trackId",
                        "status",
                        "text",
                        "language",
                        "failureCode",
                        "createdAt",
                        "updatedAt"
                    )
                    SELECT
                        :transcript_id,
                        :track_id,
                        'COMPLETED',
                        :transcript_text,
                        :language,
                        NULL,
                        NOW(),
                        NOW()
                    FROM valid_lease
                    WHERE EXISTS (
                        SELECT 1
                        FROM "call_recording_tracks" AS t
                        WHERE
                            t."id" = :track_id
                            AND t."recordingId" = :recording_id
                    )
                    ON CONFLICT ("trackId") DO UPDATE
                    SET
                        "status" = 'COMPLETED',
                        "text" = EXCLUDED."text",
                        "language" = EXCLUDED."language",
                        "failureCode" = NULL,
                        "updatedAt" = NOW()
                    RETURNING "id"
                )
                SELECT "id" FROM saved
                """
            ),
            {
                "job_id": job_id,
                "recording_id": recording_id,
                "track_id": track_id,
                "lease_token": lease_token,
                "lease_seconds": lease_seconds,
                "transcript_id": uuid.uuid4(),
                "transcript_text": transcript_text,
                "language": language,
            },
        )

        return result.scalar_one_or_none() is not None

    async def save_summary(
        self,
        db: AsyncSession,
        *,
        job_id: uuid.UUID,
        recording_id: uuid.UUID,
        call_id: uuid.UUID,
        lease_token: str,
        summary_text: str,
        key_points: list[str],
        action_items: list[dict],
        lease_seconds: int = 120,
    ) -> bool:
        """Persist a completed summary only while this worker owns its lease."""
        result = await db.execute(
            text(
                """
                WITH valid_lease AS (
                    SELECT j."id"
                    FROM "call_processing_jobs" AS j
                    JOIN "call_recordings" AS r
                      ON r."id" = j."recordingId"
                    WHERE
                        j."id" = :job_id
                        AND j."recordingId" = :recording_id
                        AND r."callId" = :call_id
                        AND j."status" = 'RUNNING'
                        AND j."leaseToken" = :lease_token
                        AND j."lockedAt" > NOW() - (
                            :lease_seconds * INTERVAL '1 second'
                        )
                ),
                saved AS (
                    INSERT INTO "call_summaries" (
                        "id",
                        "callId",
                        "status",
                        "summary",
                        "keyPoints",
                        "actionItems",
                        "failureCode",
                        "generatedAt",
                        "createdAt",
                        "updatedAt"
                    )
                    SELECT
                        :summary_id,
                        :call_id,
                        'COMPLETED',
                        :summary_text,
                        CAST(:key_points AS JSONB),
                        CAST(:action_items AS JSONB),
                        NULL,
                        NOW(),
                        NOW(),
                        NOW()
                    FROM valid_lease
                    ON CONFLICT ("callId") DO UPDATE
                    SET
                        "status" = 'COMPLETED',
                        "summary" = EXCLUDED."summary",
                        "keyPoints" = EXCLUDED."keyPoints",
                        "actionItems" = EXCLUDED."actionItems",
                        "failureCode" = NULL,
                        "generatedAt" = NOW(),
                        "updatedAt" = NOW()
                    RETURNING "id"
                )
                SELECT "id" FROM saved
                """
            ),
            {
                "job_id": job_id,
                "recording_id": recording_id,
                "call_id": call_id,
                "lease_token": lease_token,
                "lease_seconds": lease_seconds,
                "summary_id": uuid.uuid4(),
                "summary_text": summary_text,
                "key_points": json.dumps(key_points),
                "action_items": json.dumps(action_items),
            },
        )

        return result.scalar_one_or_none() is not None

    async def claim_next(
        self,
        db: AsyncSession,
        *,
        lease_seconds: int = 120,
        max_attempts: int = 3,
    ) -> ClaimedRecordingJob | None:
        """Claim one available or expired job without blocking other workers."""
        lease_token = str(uuid.uuid4())

        result = await db.execute(
            text(
                """
                WITH candidate AS (
                    SELECT j."id"
                    FROM "call_processing_jobs" AS j
                    JOIN "call_recordings" AS r
                      ON r."id" = j."recordingId"
                    WHERE (
                        (
                            j."status" = 'QUEUED'
                            AND j."availableAt" <= NOW()
                        )
                        OR (
                            j."status" = 'RUNNING'
                            AND j."lockedAt" <=
                                NOW() - (:lease_seconds * INTERVAL '1 second')
                        )
                    )
                    AND j."attempts" < :max_attempts
                    AND r."status" IN ('UPLOADED', 'PROCESSING')
                    ORDER BY j."availableAt", j."createdAt"
                    LIMIT 1
                    FOR UPDATE OF j SKIP LOCKED
                ),
                claimed AS (
                    UPDATE "call_processing_jobs" AS j
                    SET
                        "status" = 'RUNNING',
                        "attempts" = j."attempts" + 1,
                        "lockedAt" = NOW(),
                        "leaseToken" = :lease_token,
                        "updatedAt" = NOW()
                    FROM candidate AS c
                    WHERE j."id" = c."id"
                    RETURNING
                        j."id",
                        j."recordingId",
                        j."attempts",
                        j."leaseToken"
                ),
                recording_update AS (
                    UPDATE "call_recordings" AS r
                    SET
                        "status" = 'PROCESSING',
                        "updatedAt" = NOW()
                    FROM claimed AS c
                    WHERE r."id" = c."recordingId"
                )
                SELECT
                    c."id",
                    c."recordingId",
                    r."callId",
                    c."leaseToken",
                    c."attempts"
                FROM claimed AS c
                JOIN "call_recordings" AS r
                  ON r."id" = c."recordingId"
                """
            ),
            {
                "lease_seconds": lease_seconds,
                "max_attempts": max_attempts,
                "lease_token": lease_token,
            },
        )

        row = result.mappings().one_or_none()
        if row is None:
            return None

        return ClaimedRecordingJob(
            id=row["id"],
            recording_id=row["recordingId"],
            call_id=row["callId"],
            lease_token=row["leaseToken"],
            attempts=row["attempts"],
        )

    async def renew_lease(
        self,
        db: AsyncSession,
        *,
        job_id: uuid.UUID,
        lease_token: str,
        lease_seconds: int = 120,
    ) -> bool:
        """Renew a lease only if this worker still owns it."""
        result = await db.execute(
            text(
                """
                UPDATE "call_processing_jobs"
                SET
                    "lockedAt" = NOW(),
                    "updatedAt" = NOW()
                WHERE
                    "id" = :job_id
                    AND "status" = 'RUNNING'
                    AND "leaseToken" = :lease_token
                    AND "lockedAt" > NOW() - (
                        :lease_seconds * INTERVAL '1 second'
                    )
                RETURNING "id"
                """
            ),
            {
                "job_id": job_id,
                "lease_token": lease_token,
                "lease_seconds": lease_seconds,
            },
        )
        return result.scalar_one_or_none() is not None

    async def complete(
        self,
        db: AsyncSession,
        *,
        job_id: uuid.UUID,
        lease_token: str,
        lease_seconds: int = 120,
    ) -> bool:
        """Complete a job and mark its recording READY if the lease is valid."""
        result = await db.execute(
            text(
                """
                WITH completed AS (
                    UPDATE "call_processing_jobs"
                    SET
                        "status" = 'COMPLETED',
                        "completedAt" = NOW(),
                        "lockedAt" = NULL,
                        "leaseToken" = NULL,
                        "lastErrorCode" = NULL,
                        "updatedAt" = NOW()
                    WHERE
                        "id" = :job_id
                        AND "status" = 'RUNNING'
                        AND "leaseToken" = :lease_token
                        AND "lockedAt" > NOW() - (
                            :lease_seconds * INTERVAL '1 second'
                        )
                    RETURNING "recordingId"
                ),
                recording_update AS (
                    UPDATE "call_recordings" AS r
                    SET
                        "status" = 'READY',
                        "processedAt" = NOW(),
                        "failureCode" = NULL,
                        "updatedAt" = NOW()
                    FROM completed AS c
                    WHERE r."id" = c."recordingId"
                    RETURNING r."id"
                )
                SELECT "id" FROM recording_update
                """
            ),
            {
                "job_id": job_id,
                "lease_token": lease_token,
                "lease_seconds": lease_seconds,
            },
        )
        return result.scalar_one_or_none() is not None

    async def retry_or_fail(
        self,
        db: AsyncSession,
        *,
        job_id: uuid.UUID,
        lease_token: str,
        attempts: int,
        failure_code: str,
        lease_seconds: int = 120,
        max_attempts: int = 3,
        retry_delay_seconds: int = 30,
    ) -> bool:
        """Schedule a retry or permanently fail a job, guarded by its lease."""
        terminal = attempts >= max_attempts

        result = await db.execute(
            text(
                """
                WITH updated_job AS (
                    UPDATE "call_processing_jobs"
                    SET
                        "status" = CASE
                            WHEN :terminal THEN 'FAILED'::"CallProcessingJobStatus"
                            ELSE 'QUEUED'::"CallProcessingJobStatus"
                        END,
                        "availableAt" = CASE
                            WHEN :terminal THEN "availableAt"
                            ELSE NOW() + (
                                :retry_delay_seconds * INTERVAL '1 second'
                            )
                        END,
                        "lockedAt" = NULL,
                        "leaseToken" = NULL,
                        "lastErrorCode" = :failure_code,
                        "completedAt" = CASE
                            WHEN :terminal THEN NOW()
                            ELSE NULL
                        END,
                        "updatedAt" = NOW()
                    WHERE
                        "id" = :job_id
                        AND "status" = 'RUNNING'
                        AND "leaseToken" = :lease_token
                        AND "lockedAt" > NOW() - (
                            :lease_seconds * INTERVAL '1 second'
                        )
                    RETURNING "recordingId"
                ),
                recording_update AS (
                    UPDATE "call_recordings" AS r
                    SET
                        "status" = CASE
                            WHEN :terminal THEN 'FAILED'::"CallRecordingStatus"
                            ELSE 'PROCESSING'::"CallRecordingStatus"
                        END,
                        "failureCode" = CASE
                            WHEN :terminal THEN :failure_code
                            ELSE NULL
                        END,
                        "updatedAt" = NOW()
                    FROM updated_job AS j
                    WHERE r."id" = j."recordingId"
                    RETURNING r."id"
                )
                SELECT "id" FROM recording_update
                """
            ),
            {
                "job_id": job_id,
                "lease_token": lease_token,
                "lease_seconds": lease_seconds,
                "terminal": terminal,
                "retry_delay_seconds": retry_delay_seconds,
                "failure_code": failure_code,
            },
        )
        return result.scalar_one_or_none() is not None

    async def fail_exhausted_jobs(
        self,
        db: AsyncSession,
        *,
        lease_seconds: int = 120,
        max_attempts: int = 3,
    ) -> int:
        """Fail expired jobs that exhausted their attempts before crashing."""
        result = await db.execute(
            text(
                """
                WITH exhausted AS (
                    UPDATE "call_processing_jobs"
                    SET
                        "status" = 'FAILED',
                        "completedAt" = NOW(),
                        "lockedAt" = NULL,
                        "leaseToken" = NULL,
                        "lastErrorCode" = 'MAX_ATTEMPTS_EXCEEDED',
                        "updatedAt" = NOW()
                    WHERE
                        "status" = 'RUNNING'
                        AND "attempts" >= :max_attempts
                        AND "lockedAt" <=
                            NOW() - (:lease_seconds * INTERVAL '1 second')
                    RETURNING "recordingId"
                ),
                recording_update AS (
                    UPDATE "call_recordings" AS r
                    SET
                        "status" = 'FAILED',
                        "failureCode" = 'MAX_ATTEMPTS_EXCEEDED',
                        "updatedAt" = NOW()
                    FROM exhausted AS e
                    WHERE r."id" = e."recordingId"
                    RETURNING r."id"
                )
                SELECT COUNT(*) FROM recording_update
                """
            ),
            {
                "lease_seconds": lease_seconds,
                "max_attempts": max_attempts,
            },
        )
        return result.scalar_one()
