from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from app.recordings.storage import RecordingStorage


@pytest.fixture
def storage_env(monkeypatch):
    monkeypatch.setenv("CALL_RECORDING_STORAGE_ENDPOINT", "http://rustfs:9000")
    monkeypatch.setenv("CALL_RECORDING_STORAGE_BUCKET", "relay-call-recordings")
    monkeypatch.setenv("CALL_RECORDING_STORAGE_REGION", "us-east-1")
    monkeypatch.setenv("CALL_RECORDING_STORAGE_ACCESS_KEY_ID", "test-access")
    monkeypatch.setenv("CALL_RECORDING_STORAGE_SECRET_ACCESS_KEY", "test-secret")
    monkeypatch.setenv("CALL_RECORDING_STORAGE_FORCE_PATH_STYLE", "true")


@patch("app.recordings.storage.boto3.client")
def test_initializes_s3_client(mock_boto_client, storage_env):
    storage = RecordingStorage()

    assert storage.bucket == "relay-call-recordings"
    mock_boto_client.assert_called_once()

    args, kwargs = mock_boto_client.call_args
    assert args == ("s3",)
    assert kwargs["endpoint_url"] == "http://rustfs:9000"
    assert kwargs["region_name"] == "us-east-1"
    assert kwargs["aws_access_key_id"] == "test-access"
    assert kwargs["aws_secret_access_key"] == "test-secret"
    assert kwargs["config"].s3["addressing_style"] == "path"


@patch("app.recordings.storage.boto3.client")
def test_downloads_object_and_removes_temporary_file(
    mock_boto_client,
    storage_env,
):
    client = Mock()
    mock_boto_client.return_value = client
    storage = RecordingStorage()

    with storage.download_to_tempfile("calls/recording/local.wav") as path:
        assert path.is_file()
        assert path.suffix == ".wav"

        client.download_file.assert_called_once_with(
            "relay-call-recordings",
            "calls/recording/local.wav",
            str(path),
        )

    assert not path.exists()


@patch("app.recordings.storage.boto3.client")
def test_removes_temporary_file_when_consumer_fails(
    mock_boto_client,
    storage_env,
):
    mock_boto_client.return_value = Mock()
    storage = RecordingStorage()

    with pytest.raises(RuntimeError, match="transcription failed"):
        with storage.download_to_tempfile("calls/recording/remote.wav") as path:
            assert path.exists()
            raise RuntimeError("transcription failed")

    assert not path.exists()


@patch("app.recordings.storage.boto3.client")
def test_rejects_empty_object_key(mock_boto_client, storage_env):
    storage = RecordingStorage()

    with pytest.raises(ValueError, match="object key must not be empty"):
        with storage.download_to_tempfile(" "):
            pass

    mock_boto_client.return_value.download_file.assert_not_called()


@patch("app.recordings.storage.boto3.client")
def test_rejects_missing_configuration(mock_boto_client, monkeypatch):
    for name in (
        "CALL_RECORDING_STORAGE_ENDPOINT",
        "CALL_RECORDING_STORAGE_BUCKET",
        "CALL_RECORDING_STORAGE_REGION",
        "CALL_RECORDING_STORAGE_ACCESS_KEY_ID",
        "CALL_RECORDING_STORAGE_SECRET_ACCESS_KEY",
    ):
        monkeypatch.delenv(name, raising=False)

    with pytest.raises(ValueError, match="CALL_RECORDING_STORAGE_ENDPOINT"):
        RecordingStorage()

    mock_boto_client.assert_not_called()
