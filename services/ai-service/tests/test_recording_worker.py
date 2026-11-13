import hashlib
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.recordings.repository import RecordingTrack
from app.recordings.worker import (
    ProcessingFailure,
    _build_analysis_messages,
    _download_and_transcribe,
    _verify_audio_file,
)


def make_track(path: Path, content: bytes) -> RecordingTrack:
    path.write_bytes(content)
    return RecordingTrack(
        id=__import__("uuid").uuid4(),
        kind="LOCAL_MICROPHONE",
        object_key="recordings/local.wav",
        content_type="audio/wav",
        duration_ms=1000,
        byte_size=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
    )


def test_verify_audio_file_accepts_matching_metadata(tmp_path):
    content = b"valid wav test data"
    track = make_track(tmp_path / "audio.wav", content)

    _verify_audio_file(tmp_path / "audio.wav", track)


def test_verify_audio_file_rejects_wrong_size(tmp_path):
    content = b"valid wav test data"
    track = make_track(tmp_path / "audio.wav", content)
    (tmp_path / "audio.wav").write_bytes(b"different size")

    with pytest.raises(ProcessingFailure) as exc:
        _verify_audio_file(tmp_path / "audio.wav", track)

    assert exc.value.code == "TRACK_INTEGRITY_FAILED"


def test_verify_audio_file_rejects_wrong_hash(tmp_path):
    content = b"valid wav test data"
    track = make_track(tmp_path / "audio.wav", content)
    track = RecordingTrack(
        id=track.id,
        kind=track.kind,
        object_key=track.object_key,
        content_type=track.content_type,
        duration_ms=track.duration_ms,
        byte_size=track.byte_size,
        sha256="0" * 64,
    )

    with pytest.raises(ProcessingFailure) as exc:
        _verify_audio_file(tmp_path / "audio.wav", track)

    assert exc.value.code == "TRACK_INTEGRITY_FAILED"


def test_verify_audio_file_rejects_invalid_expected_hash(tmp_path):
    content = b"valid wav test data"
    track = make_track(tmp_path / "audio.wav", content)
    track = RecordingTrack(
        id=track.id,
        kind=track.kind,
        object_key=track.object_key,
        content_type=track.content_type,
        duration_ms=track.duration_ms,
        byte_size=track.byte_size,
        sha256="invalid",
    )

    with pytest.raises(ProcessingFailure) as exc:
        _verify_audio_file(tmp_path / "audio.wav", track)

    assert exc.value.code == "TRACK_INTEGRITY_FAILED"


def test_download_and_transcribe_uses_verified_temporary_file(tmp_path):
    content = b"valid wav test data"
    track = make_track(tmp_path / "source.wav", content)
    transcriber = Mock()
    transcriber.transcribe_file.return_value = SimpleNamespace(
        text="Hello there",
        language="en",
        duration_seconds=1.0,
    )

    @contextmanager
    def download(_object_key):
        downloaded = tmp_path / "download.wav"
        downloaded.write_bytes(content)
        try:
            yield downloaded
        finally:
            downloaded.unlink(missing_ok=True)

    storage = SimpleNamespace(download_to_tempfile=download)

    result = _download_and_transcribe(storage, transcriber, track)

    assert result.text == "Hello there"
    transcriber.transcribe_file.assert_called_once()
    assert not (tmp_path / "download.wav").exists()


def test_download_failure_has_stable_error_code():
    def download(_object_key):
        raise OSError("storage unavailable")

    storage = SimpleNamespace(download_to_tempfile=download)

    track = RecordingTrack(
        id=__import__("uuid").uuid4(),
        kind="LOCAL_MICROPHONE",
        object_key="recordings/local.wav",
        content_type="audio/wav",
        duration_ms=1000,
        byte_size=1,
        sha256=hashlib.sha256(b"x").hexdigest(),
    )

    with pytest.raises(ProcessingFailure) as exc:
        _download_and_transcribe(storage, Mock(), track)

    assert exc.value.code == "AUDIO_DOWNLOAD_FAILED"


def test_transcription_failure_has_stable_error_code(tmp_path):
    content = b"valid wav test data"
    track = make_track(tmp_path / "source.wav", content)

    @contextmanager
    def download(_object_key):
        downloaded = tmp_path / "download.wav"
        downloaded.write_bytes(content)
        try:
            yield downloaded
        finally:
            downloaded.unlink(missing_ok=True)

    transcriber = Mock()
    transcriber.transcribe_file.side_effect = RuntimeError("decoder failed")
    storage = SimpleNamespace(download_to_tempfile=download)

    with pytest.raises(ProcessingFailure) as exc:
        _download_and_transcribe(storage, transcriber, track)

    assert exc.value.code == "TRANSCRIPTION_FAILED"


def test_build_analysis_messages_preserves_both_speakers():
    messages = _build_analysis_messages(
        "We should ship on Monday.",
        "I agree with that plan.",
    )

    assert len(messages) == 2
    assert messages[0].sender == "Local participant"
    assert messages[0].text == "We should ship on Monday."
    assert messages[1].sender == "Remote participant"
    assert messages[1].text == "I agree with that plan."


def test_build_analysis_messages_splits_long_transcript():
    transcript = "word " * 1200

    messages = _build_analysis_messages(transcript, "Acknowledged.")

    local_messages = [
        message for message in messages
        if message.sender == "Local participant"
    ]

    assert len(local_messages) > 1
    assert all(len(message.text) <= 5000 for message in messages)
    assert " ".join(message.text for message in local_messages) == transcript.strip()


def test_build_analysis_messages_rejects_empty_transcripts():
    with pytest.raises(ProcessingFailure) as exc:
        _build_analysis_messages("", "   ")

    assert exc.value.code == "TRANSCRIPTION_EMPTY"


def test_build_analysis_messages_rejects_oversized_transcript():
    transcript = "word " * 11000

    with pytest.raises(ProcessingFailure) as exc:
        _build_analysis_messages(transcript, "")

    assert exc.value.code == "TRANSCRIPT_TOO_LONG"

@pytest.mark.asyncio
async def test_heartbeat_renews_until_lease_is_lost(monkeypatch):
    import asyncio
    import uuid
    from unittest.mock import AsyncMock

    from app.recordings.repository import ClaimedRecordingJob
    from app.recordings.worker import RecordingWorker, WorkerConfig

    worker = RecordingWorker(
        session_factory=Mock(),
        repository=Mock(),
        storage=Mock(),
        transcriber=Mock(),
        config=WorkerConfig(
            database_url="postgresql+asyncpg://worker:worker@localhost/relay",
            lease_seconds=10,
            heartbeat_seconds=1,
        ),
    )
    worker._renew_lease = AsyncMock(side_effect=[True, False])

    # Avoid real delays while exercising the heartbeat loop.
    monkeypatch.setattr(
        "app.recordings.worker.asyncio.sleep",
        AsyncMock(return_value=None),
    )

    job = ClaimedRecordingJob(
        id=uuid.uuid4(),
        recording_id=uuid.uuid4(),
        call_id=uuid.uuid4(),
        lease_token="test-lease-token",
        attempts=1,
    )
    lost_lease = asyncio.Event()

    await worker._heartbeat(job, lost_lease)

    assert lost_lease.is_set()
    assert worker._renew_lease.await_count == 2


@pytest.mark.asyncio
async def test_heartbeat_stops_when_renewal_raises():
    import asyncio
    import uuid
    from unittest.mock import AsyncMock

    from app.recordings.repository import ClaimedRecordingJob
    from app.recordings.worker import RecordingWorker, WorkerConfig

    worker = RecordingWorker(
        session_factory=Mock(),
        repository=Mock(),
        storage=Mock(),
        transcriber=Mock(),
        config=WorkerConfig(
            database_url="postgresql+asyncpg://worker:worker@localhost/relay",
            lease_seconds=10,
            heartbeat_seconds=1,
        ),
    )
    worker._renew_lease = AsyncMock(
        side_effect=RuntimeError("database unavailable")
    )

    job = ClaimedRecordingJob(
        id=uuid.uuid4(),
        recording_id=uuid.uuid4(),
        call_id=uuid.uuid4(),
        lease_token="test-lease-token",
        attempts=1,
    )
    lost_lease = asyncio.Event()

    await worker._heartbeat(job, lost_lease)

    assert lost_lease.is_set()
    worker._renew_lease.assert_awaited_once()


@pytest.mark.asyncio
async def test_process_does_not_finalize_after_lease_is_lost(monkeypatch):
    import asyncio
    import uuid
    from unittest.mock import AsyncMock

    from app.recordings.repository import ClaimedRecordingJob
    from app.recordings.worker import RecordingWorker, WorkerConfig

    class SessionContext:
        async def __aenter__(self):
            return Mock()

        async def __aexit__(self, *args):
            return None

    session_factory = Mock(return_value=SessionContext())

    repository = Mock()
    repository.load_tracks = AsyncMock(return_value=[
        RecordingTrack(
            id=uuid.uuid4(),
            kind="LOCAL_MICROPHONE",
            object_key="recordings/local.wav",
            content_type="audio/wav",
            duration_ms=1000,
            byte_size=100,
            sha256="a" * 64,
        ),
        RecordingTrack(
            id=uuid.uuid4(),
            kind="REMOTE_PARTICIPANT",
            object_key="recordings/remote.wav",
            content_type="audio/wav",
            duration_ms=1000,
            byte_size=100,
            sha256="b" * 64,
        ),
    ])

    worker = RecordingWorker(
        session_factory=session_factory,
        repository=repository,
        storage=Mock(),
        transcriber=Mock(),
        config=WorkerConfig(
            database_url="postgresql+asyncpg://worker:worker@localhost/relay",
            lease_seconds=10,
            heartbeat_seconds=1,
        ),
    )

    worker._save_transcript = AsyncMock()
    worker._finalize = AsyncMock()
    worker._record_failure = AsyncMock()

    monkeypatch.setattr(
        "app.recordings.worker._download_and_transcribe",
        Mock(side_effect=[
            SimpleNamespace(text="Local speech", language="en"),
            SimpleNamespace(text="Remote speech", language="en"),
        ]),
    )

    analysis_started = asyncio.Event()

    async def fake_analysis(messages):
        analysis_started.set()
        await asyncio.sleep(0)
        return SimpleNamespace(
            summary="A summary",
            decisions=["A decision"],
            action_items=[],
        )

    async def fake_heartbeat(job, lost_lease):
        await analysis_started.wait()
        lost_lease.set()

    monkeypatch.setattr(
        "app.recordings.worker.analyze_conversation",
        fake_analysis,
    )
    worker._heartbeat = fake_heartbeat

    job = ClaimedRecordingJob(
        id=uuid.uuid4(),
        recording_id=uuid.uuid4(),
        call_id=uuid.uuid4(),
        lease_token="test-lease-token",
        attempts=1,
    )

    await worker.process(job)

    assert worker._save_transcript.await_count == 2
    worker._finalize.assert_not_awaited()
    worker._record_failure.assert_not_awaited()


@pytest.mark.asyncio
async def test_process_saves_both_transcripts_and_finalizes_successfully(monkeypatch):
    import asyncio
    import uuid
    from unittest.mock import AsyncMock

    from app.recordings.repository import ClaimedRecordingJob
    from app.recordings.worker import RecordingWorker, WorkerConfig

    class SessionContext:
        async def __aenter__(self):
            return Mock()

        async def __aexit__(self, *args):
            return None

    repository = Mock()
    repository.load_tracks = AsyncMock(return_value=[
        RecordingTrack(
            id=uuid.uuid4(),
            kind="LOCAL_MICROPHONE",
            object_key="recordings/local.wav",
            content_type="audio/wav",
            duration_ms=1000,
            byte_size=100,
            sha256="a" * 64,
        ),
        RecordingTrack(
            id=uuid.uuid4(),
            kind="REMOTE_PARTICIPANT",
            object_key="recordings/remote.wav",
            content_type="audio/wav",
            duration_ms=1000,
            byte_size=100,
            sha256="b" * 64,
        ),
    ])

    worker = RecordingWorker(
        session_factory=Mock(return_value=SessionContext()),
        repository=repository,
        storage=Mock(),
        transcriber=Mock(),
        config=WorkerConfig(
            database_url="postgresql+asyncpg://worker:worker@localhost/relay",
            lease_seconds=10,
            heartbeat_seconds=1,
        ),
    )

    worker._save_transcript = AsyncMock()
    worker._finalize = AsyncMock()
    worker._record_failure = AsyncMock()

    monkeypatch.setattr(
        "app.recordings.worker._download_and_transcribe",
        Mock(side_effect=[
            SimpleNamespace(text=" Local speech ", language="en"),
            SimpleNamespace(text=" Remote speech ", language="en"),
        ]),
    )

    async def idle_heartbeat(job, lost_lease):
        await asyncio.Event().wait()

    async def fake_analysis(messages):
        assert [message.sender for message in messages] == [
            "Local participant",
            "Remote participant",
        ]
        return SimpleNamespace(
            summary="The participants agreed on a plan.",
            decisions=["Ship on Monday."],
            action_items=[],
        )

    worker._heartbeat = idle_heartbeat
    monkeypatch.setattr(
        "app.recordings.worker.analyze_conversation",
        fake_analysis,
    )

    job = ClaimedRecordingJob(
        id=uuid.uuid4(),
        recording_id=uuid.uuid4(),
        call_id=uuid.uuid4(),
        lease_token="test-lease-token",
        attempts=1,
    )

    await worker.process(job)

    assert worker._save_transcript.await_count == 2
    worker._finalize.assert_awaited_once_with(
        job,
        "The participants agreed on a plan.",
        ["Ship on Monday."],
        [],
    )
    worker._record_failure.assert_not_awaited()


@pytest.mark.asyncio
async def test_process_retries_when_required_tracks_are_missing():
    import asyncio
    import uuid
    from unittest.mock import AsyncMock

    from app.recordings.repository import ClaimedRecordingJob
    from app.recordings.worker import RecordingWorker, WorkerConfig

    class SessionContext:
        async def __aenter__(self):
            return Mock()

        async def __aexit__(self, *args):
            return None

    repository = Mock()
    repository.load_tracks = AsyncMock(return_value=[])

    worker = RecordingWorker(
        session_factory=Mock(return_value=SessionContext()),
        repository=repository,
        storage=Mock(),
        transcriber=Mock(),
        config=WorkerConfig(
            database_url="postgresql+asyncpg://worker:worker@localhost/relay",
            lease_seconds=10,
            heartbeat_seconds=1,
        ),
    )

    worker._record_failure = AsyncMock()
    worker._finalize = AsyncMock()

    async def idle_heartbeat(job, lost_lease):
        await asyncio.Event().wait()

    worker._heartbeat = idle_heartbeat

    job = ClaimedRecordingJob(
        id=uuid.uuid4(),
        recording_id=uuid.uuid4(),
        call_id=uuid.uuid4(),
        lease_token="test-lease-token",
        attempts=1,
    )

    await worker.process(job)

    worker._record_failure.assert_awaited_once_with(
        job,
        "TRACK_NOT_FOUND",
    )
    worker._finalize.assert_not_awaited()


@pytest.mark.asyncio
async def test_process_heartbeat_publishes_worker_state_and_ttl():
    import json
    from unittest.mock import AsyncMock

    from app.recordings.worker import (
        PROCESS_HEARTBEAT_KEY,
        PROCESS_HEARTBEAT_TTL_SECONDS,
        RecordingWorker,
        WorkerConfig,
    )

    redis_client = Mock()
    redis_client.set = AsyncMock()
    worker = RecordingWorker(
        session_factory=Mock(),
        repository=Mock(),
        storage=Mock(),
        transcriber=Mock(),
        config=WorkerConfig(
            database_url="postgresql+asyncpg://worker:worker@localhost/relay"
        ),
        redis_client=redis_client,
    )
    worker._health_state = "processing"
    worker._last_poll_at = "2026-11-08T07:00:00+00:00"

    await worker._publish_process_heartbeat()

    redis_client.set.assert_awaited_once()
    args = redis_client.set.call_args
    assert args.args[0] == PROCESS_HEARTBEAT_KEY
    payload = json.loads(args.args[1])
    assert payload["worker"] == "recording-worker"
    assert payload["status"] == "processing"
    assert payload["last_poll_at"] == worker._last_poll_at
    assert payload["last_poll_error"] is None
    assert args.kwargs["ex"] == PROCESS_HEARTBEAT_TTL_SECONDS


@pytest.mark.asyncio
async def test_process_heartbeat_retries_after_transient_failure(monkeypatch):
    import asyncio
    from unittest.mock import AsyncMock

    from app.recordings.worker import RecordingWorker, WorkerConfig

    redis_client = Mock()
    worker = RecordingWorker(
        session_factory=Mock(),
        repository=Mock(),
        storage=Mock(),
        transcriber=Mock(),
        config=WorkerConfig(
            database_url="postgresql+asyncpg://worker:worker@localhost/relay"
        ),
        redis_client=redis_client,
    )

    publish = AsyncMock(
        side_effect=[ConnectionError("temporary Redis failure"), None]
    )
    worker._publish_process_heartbeat = publish

    waits = 0

    async def fake_wait_for(awaitable, timeout):
        nonlocal waits
        waits += 1
        awaitable.close()
        if waits == 1:
            assert timeout == 5
            return
        worker.request_stop()
        return

    monkeypatch.setattr(asyncio, "wait_for", fake_wait_for)

    await worker._run_process_heartbeat()

    assert publish.await_count == 2
    assert worker.stopping.is_set()


@pytest.mark.asyncio
async def test_run_removes_process_heartbeat_on_shutdown():
    from unittest.mock import AsyncMock

    from app.recordings.worker import (
        PROCESS_HEARTBEAT_KEY,
        RecordingWorker,
        WorkerConfig,
    )

    redis_client = Mock()
    redis_client.set = AsyncMock()
    redis_client.delete = AsyncMock()
    worker = RecordingWorker(
        session_factory=Mock(),
        repository=Mock(),
        storage=Mock(),
        transcriber=Mock(),
        config=WorkerConfig(
            database_url="postgresql+asyncpg://worker:worker@localhost/relay"
        ),
        redis_client=redis_client,
    )
    worker.request_stop()

    await worker.run()

    redis_client.delete.assert_awaited_once_with(PROCESS_HEARTBEAT_KEY)
