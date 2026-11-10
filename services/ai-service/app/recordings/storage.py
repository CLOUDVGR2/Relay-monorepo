from __future__ import annotations

import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import boto3
from botocore.config import Config


class RecordingStorage:
    def __init__(self) -> None:
        endpoint = os.getenv("CALL_RECORDING_STORAGE_ENDPOINT")
        bucket = os.getenv("CALL_RECORDING_STORAGE_BUCKET")
        region = os.getenv("CALL_RECORDING_STORAGE_REGION")
        access_key = os.getenv("CALL_RECORDING_STORAGE_ACCESS_KEY_ID")
        secret_key = os.getenv("CALL_RECORDING_STORAGE_SECRET_ACCESS_KEY")

        missing = [
            name
            for name, value in (
                ("CALL_RECORDING_STORAGE_ENDPOINT", endpoint),
                ("CALL_RECORDING_STORAGE_BUCKET", bucket),
                ("CALL_RECORDING_STORAGE_REGION", region),
                ("CALL_RECORDING_STORAGE_ACCESS_KEY_ID", access_key),
                ("CALL_RECORDING_STORAGE_SECRET_ACCESS_KEY", secret_key),
            )
            if not value
        ]

        if missing:
            raise ValueError(
                "Missing recording storage configuration: "
                + ", ".join(missing)
            )

        force_path_style = (
            os.getenv("CALL_RECORDING_STORAGE_FORCE_PATH_STYLE", "true").lower()
            in {"1", "true", "yes", "on"}
        )

        self.bucket = bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=Config(
                s3={
                    "addressing_style": (
                        "path" if force_path_style else "auto"
                    )
                }
            ),
        )

    @contextmanager
    def download_to_tempfile(self, object_key: str) -> Iterator[Path]:
        if not object_key or not object_key.strip():
            raise ValueError("Recording object key must not be empty")

        temp_path: Path | None = None

        try:
            with tempfile.NamedTemporaryFile(
                prefix="relay-recording-",
                suffix=".wav",
                delete=False,
            ) as temp_file:
                temp_path = Path(temp_file.name)

            self.client.download_file(
                self.bucket,
                object_key,
                str(temp_path),
            )

            yield temp_path

        finally:
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)
