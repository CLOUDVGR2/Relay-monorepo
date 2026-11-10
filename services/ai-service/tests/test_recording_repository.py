"""Tests for durable call recording job persistence."""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.recordings.repository import (
    ClaimedRecordingJob,
    RecordingJobRepository,
)


@pytest.fixture
def repository():
    return RecordingJobRepository()


@pytest.mark.asyncio
async def test_claim_returns_none_when_no_job_is_available(repository):
    db = MagicMock()
    result = MagicMock()
    result.mappings.return_value.one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result)

    claimed = await repository.claim_next(db)

    assert claimed is None
    sql = str(db.execute.await_args.args[0])
    assert 'FOR UPDATE OF j SKIP LOCKED' in sql
    assert '"attempts" < :max_attempts' in sql
    assert '"leaseToken" = :lease_token' in sql
    assert "UPLOADED" in sql
    assert "PROCESSING" in sql


@pytest.mark.asyncio
async def test_claim_returns_claimed_job(repository):
    job_id = uuid.uuid4()
    recording_id = uuid.uuid4()
    call_id = uuid.uuid4()
    lease_token = str(uuid.uuid4())

    db = MagicMock()
    result = MagicMock()
    result.mappings.return_value.one_or_none.return_value = {
        "id": job_id,
        "recordingId": recording_id,
        "callId": call_id,
        "leaseToken": lease_token,
        "attempts": 1,
    }
    db.execute = AsyncMock(return_value=result)

    claimed = await repository.claim_next(db)

    assert claimed == ClaimedRecordingJob(
        id=job_id,
        recording_id=recording_id,
        call_id=call_id,
        lease_token=lease_token,
        attempts=1,
    )


@pytest.mark.asyncio
async def test_renew_lease_requires_matching_token(repository):
    db = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result)

    renewed = await repository.renew_lease(
        db,
        job_id=uuid.uuid4(),
        lease_token=str(uuid.uuid4()),
    )

    assert renewed is False
    sql = str(db.execute.await_args.args[0])
    assert '"status" = \'RUNNING\'' in sql
    assert '"leaseToken" = :lease_token' in sql
    assert '"lockedAt" > NOW()' in sql
    assert db.execute.await_args.args[1]["lease_seconds"] == 120


@pytest.mark.asyncio
async def test_complete_requires_matching_lease(repository):
    db = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result)

    completed = await repository.complete(
        db,
        job_id=uuid.uuid4(),
        lease_token=str(uuid.uuid4()),
    )

    assert completed is False
    sql = str(db.execute.await_args.args[0])
    assert '"leaseToken" = :lease_token' in sql
    assert "'READY'" in sql
    assert "'COMPLETED'" in sql
    assert '"lockedAt" > NOW()' in sql
    assert db.execute.await_args.args[1]["lease_seconds"] == 120


@pytest.mark.asyncio
async def test_retry_or_fail_requeues_before_attempt_limit(repository):
    db = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = uuid.uuid4()
    db.execute = AsyncMock(return_value=result)

    updated = await repository.retry_or_fail(
        db,
        job_id=uuid.uuid4(),
        lease_token=str(uuid.uuid4()),
        attempts=1,
        failure_code="TRANSCRIPTION_FAILED",
        max_attempts=3,
    )

    assert updated is True
    params = db.execute.await_args.args[1]
    assert params["terminal"] is False
    assert params["failure_code"] == "TRANSCRIPTION_FAILED"
    assert params["lease_seconds"] == 120
    sql = str(db.execute.await_args.args[0])
    assert '"lockedAt" > NOW()' in sql


@pytest.mark.asyncio
async def test_retry_or_fail_marks_final_attempt_failed(repository):
    db = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = uuid.uuid4()
    db.execute = AsyncMock(return_value=result)

    updated = await repository.retry_or_fail(
        db,
        job_id=uuid.uuid4(),
        lease_token=str(uuid.uuid4()),
        attempts=3,
        failure_code="TRANSCRIPTION_FAILED",
        max_attempts=3,
    )

    assert updated is True
    params = db.execute.await_args.args[1]
    assert params["terminal"] is True


@pytest.mark.asyncio
async def test_exhausted_job_recovery_returns_failure_count(repository):
    db = MagicMock()
    result = MagicMock()
    result.scalar_one.return_value = 2
    db.execute = AsyncMock(return_value=result)

    failed = await repository.fail_exhausted_jobs(db)

    assert failed == 2
    sql = str(db.execute.await_args.args[0])
    assert '"attempts" >= :max_attempts' in sql
    assert '"lockedAt" <=' in sql
    assert "'MAX_ATTEMPTS_EXCEEDED'" in sql


@pytest.mark.asyncio
async def test_save_transcript_persists_with_valid_lease(repository):
    job_id = uuid.uuid4()
    recording_id = uuid.uuid4()
    track_id = uuid.uuid4()
    lease_token = str(uuid.uuid4())

    db = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = uuid.uuid4()
    db.execute = AsyncMock(return_value=result)

    saved = await repository.save_transcript(
        db,
        job_id=job_id,
        recording_id=recording_id,
        track_id=track_id,
        lease_token=lease_token,
        transcript_text="Hello, this is a test transcript.",
        language="en",
    )

    assert saved is True

    sql = str(db.execute.await_args.args[0])
    params = db.execute.await_args.args[1]

    assert '"call_transcripts"' in sql
    assert 'ON CONFLICT ("trackId") DO UPDATE' in sql
    assert '"leaseToken" = :lease_token' in sql
    assert '"lockedAt" > NOW()' in sql
    assert params["job_id"] == job_id
    assert params["recording_id"] == recording_id
    assert params["track_id"] == track_id
    assert params["lease_token"] == lease_token
    assert params["transcript_text"] == "Hello, this is a test transcript."
    assert params["language"] == "en"
    assert params["lease_seconds"] == 120


@pytest.mark.asyncio
async def test_save_transcript_rejects_invalid_lease(repository):
    db = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result)

    saved = await repository.save_transcript(
        db,
        job_id=uuid.uuid4(),
        recording_id=uuid.uuid4(),
        track_id=uuid.uuid4(),
        lease_token=str(uuid.uuid4()),
        transcript_text="Transcript",
        language="en",
    )

    assert saved is False


@pytest.mark.asyncio
async def test_save_summary_persists_json_with_valid_lease(repository):
    import json

    job_id = uuid.uuid4()
    recording_id = uuid.uuid4()
    call_id = uuid.uuid4()
    lease_token = str(uuid.uuid4())

    key_points = [
        "The team agreed to launch next week.",
        "Testing must finish first.",
    ]
    action_items = [
        {
            "task": "Complete integration tests",
            "owner": "Alex",
            "due_date": "2026-11-10",
        }
    ]

    db = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = uuid.uuid4()
    db.execute = AsyncMock(return_value=result)

    saved = await repository.save_summary(
        db,
        job_id=job_id,
        recording_id=recording_id,
        call_id=call_id,
        lease_token=lease_token,
        summary_text="The team discussed the upcoming launch.",
        key_points=key_points,
        action_items=action_items,
    )

    assert saved is True

    sql = str(db.execute.await_args.args[0])
    params = db.execute.await_args.args[1]

    assert '"call_summaries"' in sql
    assert 'ON CONFLICT ("callId") DO UPDATE' in sql
    assert '"leaseToken" = :lease_token' in sql
    assert '"lockedAt" > NOW()' in sql
    assert params["job_id"] == job_id
    assert params["recording_id"] == recording_id
    assert params["call_id"] == call_id
    assert params["lease_token"] == lease_token
    assert params["lease_seconds"] == 120
    assert json.loads(params["key_points"]) == key_points
    assert json.loads(params["action_items"]) == action_items


@pytest.mark.asyncio
async def test_save_summary_rejects_invalid_lease(repository):
    db = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result)

    saved = await repository.save_summary(
        db,
        job_id=uuid.uuid4(),
        recording_id=uuid.uuid4(),
        call_id=uuid.uuid4(),
        lease_token=str(uuid.uuid4()),
        summary_text="A summary.",
        key_points=["A decision."],
        action_items=[],
    )

    assert saved is False


@pytest.mark.asyncio
async def test_load_tracks_returns_recording_tracks(repository):
    recording_id = uuid.uuid4()
    job_id = uuid.uuid4()
    lease_token = str(uuid.uuid4())

    local_track_id = uuid.uuid4()
    remote_track_id = uuid.uuid4()

    db = MagicMock()
    result = MagicMock()
    result.mappings.return_value.all.return_value = [
        {
            "id": local_track_id,
            "kind": "LOCAL_MICROPHONE",
            "objectKey": "recordings/local.wav",
            "contentType": "audio/wav",
            "durationMs": 12000,
            "byteSize": 192000,
            "sha256": "localhash",
        },
        {
            "id": remote_track_id,
            "kind": "REMOTE_PARTICIPANT",
            "objectKey": "recordings/remote.wav",
            "contentType": "audio/wav",
            "durationMs": 12000,
            "byteSize": 192000,
            "sha256": "remotehash",
        },
    ]
    db.execute = AsyncMock(return_value=result)

    tracks = await repository.load_tracks(
        db,
        job_id=job_id,
        recording_id=recording_id,
        lease_token=lease_token,
    )

    assert len(tracks) == 2
    assert tracks[0].id == local_track_id
    assert tracks[0].kind == "LOCAL_MICROPHONE"
    assert tracks[0].content_type == "audio/wav"
    assert tracks[1].id == remote_track_id
    assert tracks[1].kind == "REMOTE_PARTICIPANT"

    sql = str(db.execute.await_args.args[0])
    params = db.execute.await_args.args[1]

    assert '"leaseToken" = :lease_token' in sql
    assert '"lockedAt" > NOW()' in sql
    assert params["job_id"] == job_id
    assert params["recording_id"] == recording_id
    assert params["lease_token"] == lease_token


@pytest.mark.asyncio
async def test_load_tracks_returns_empty_when_no_tracks(repository):
    db = MagicMock()
    result = MagicMock()
    result.mappings.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=result)

    tracks = await repository.load_tracks(
        db,
        job_id=uuid.uuid4(),
        recording_id=uuid.uuid4(),
        lease_token=str(uuid.uuid4()),
    )

    assert tracks == []
