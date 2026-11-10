from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest

from app.recordings.transcription import (
    RecordingTranscriber,
    TranscriptionResult,
)


@patch("app.recordings.transcription.WhisperModel")
def test_initializes_model_with_cpu_defaults(mock_model):
    transcriber = RecordingTranscriber()

    mock_model.assert_called_once_with(
        "tiny",
        device="cpu",
        compute_type="int8",
        cpu_threads=2,
        num_workers=1,
    )
    assert transcriber.model is mock_model.return_value


@patch("app.recordings.transcription.WhisperModel")
def test_transcribes_file_and_joins_segments(mock_model, tmp_path):
    audio_file = tmp_path / "recording.wav"
    audio_file.write_bytes(b"test")

    mock_model.return_value.transcribe.return_value = (
        iter([
            SimpleNamespace(text=" Hello "),
            SimpleNamespace(text=" "),
            SimpleNamespace(text=" world. "),
        ]),
        SimpleNamespace(language="en", duration=12.5),
    )

    transcriber = RecordingTranscriber()
    result = transcriber.transcribe_file(audio_file)

    assert result == TranscriptionResult(
        text="Hello world.",
        language="en",
        duration_seconds=12.5,
    )

    mock_model.return_value.transcribe.assert_called_once_with(
        str(audio_file),
        beam_size=1,
        vad_filter=True,
        condition_on_previous_text=False,
    )


@patch("app.recordings.transcription.WhisperModel")
def test_missing_audio_file_raises_error(mock_model, tmp_path):
    transcriber = RecordingTranscriber()
    missing_file = tmp_path / "missing.wav"

    with pytest.raises(FileNotFoundError, match="Audio file does not exist"):
        transcriber.transcribe_file(missing_file)

    mock_model.return_value.transcribe.assert_not_called()


@patch("app.recordings.transcription.WhisperModel")
def test_rejects_non_positive_cpu_threads(mock_model, monkeypatch):
    monkeypatch.setenv("WHISPER_CPU_THREADS", "0")

    with pytest.raises(ValueError, match="WHISPER_CPU_THREADS must be positive"):
        RecordingTranscriber()

    mock_model.assert_not_called()
