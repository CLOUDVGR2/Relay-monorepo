from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from faster_whisper import WhisperModel
except ModuleNotFoundError as exc:
    if exc.name != "faster_whisper":
        raise
    WhisperModel = None


@dataclass(frozen=True, slots=True)
class TranscriptionResult:
    text: str
    language: str | None
    duration_seconds: float


class RecordingTranscriber:
    def __init__(self) -> None:
        self.model_size = os.getenv("WHISPER_MODEL_SIZE", "tiny")
        self.device = os.getenv("WHISPER_DEVICE", "cpu")
        self.compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
        self.cpu_threads = int(os.getenv("WHISPER_CPU_THREADS", "2"))

        if self.cpu_threads < 1:
            raise ValueError("WHISPER_CPU_THREADS must be positive")

        model_factory = WhisperModel
        if model_factory is None:
            try:
                from faster_whisper import WhisperModel as model_factory
            except ModuleNotFoundError as exc:
                if exc.name != "faster_whisper":
                    raise
                raise RuntimeError(
                    "faster-whisper is required by the recording worker; "
                    "install recording-worker-requirements.txt"
                ) from exc

        self.model = model_factory(
            self.model_size,
            device=self.device,
            compute_type=self.compute_type,
            cpu_threads=self.cpu_threads,
            num_workers=1,
        )

    def transcribe_file(self, audio_path: str | Path) -> TranscriptionResult:
        path = Path(audio_path)

        if not path.is_file():
            raise FileNotFoundError(f"Audio file does not exist: {path}")

        segments, info = self.model.transcribe(
            str(path),
            beam_size=1,
            vad_filter=True,
            condition_on_previous_text=False,
        )

        text = " ".join(
            segment.text.strip()
            for segment in segments
            if segment.text.strip()
        ).strip()

        return TranscriptionResult(
            text=text,
            language=info.language,
            duration_seconds=info.duration,
        )
