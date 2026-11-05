"""Unit tests for safe multi-agent progress event publication."""

import json
import uuid
from unittest.mock import AsyncMock

import pytest

from app.multi_agent.progress_publisher import (
    PROGRESS_CHANNEL,
    build_progress_event,
    publish_progress,
)


def valid_progress():
    return {
        "phase": "executing",
        "steps": [
            {"step_id": "execute-1", "role": "executor", "status": "running"}
        ],
    }


def test_build_progress_event_contains_only_safe_fields():
    task_id = uuid.uuid4()
    event = build_progress_event(
        relay_user_id="user-123",
        task_id=task_id,
        progress=valid_progress(),
    )

    assert event == {
        "version": 1,
        "task_id": str(task_id),
        "relay_user_id": "user-123",
        "progress": valid_progress(),
    }


@pytest.mark.parametrize("progress", [
    {"phase": "executing", "steps": [], "output": "private model output"},
    {"phase": "unknown", "steps": []},
    {"phase": "executing", "steps": [{"step_id": "x", "role": "executor",
                                        "status": "running", "prompt": "secret"}]},
    {"phase": "executing", "steps": [
        {"step_id": "x", "role": "unknown", "status": "running"}
    ]},
    {"phase": "executing", "steps": [
        {"step_id": "x", "role": "executor", "status": "unknown"}
    ]},
    {"phase": "executing", "steps": [
        {"step_id": "x", "role": "executor", "status": "running"},
        {"step_id": "x", "role": "executor", "status": "completed"},
    ]},
    {"phase": "executing", "steps": [
        {"step_id": str(i), "role": "executor", "status": "running"}
        for i in range(13)
    ]},
])
def test_build_progress_event_rejects_invalid_or_unbounded_progress(progress):
    with pytest.raises(ValueError):
        build_progress_event(
            relay_user_id="user-123",
            task_id=uuid.uuid4(),
            progress=progress,
        )


@pytest.mark.parametrize("step_id", [
    "",
    "1execute",
    "Execute",
    "bad.step",
    "éxecute",
    "x" * 65,
])
def test_build_progress_event_rejects_invalid_step_id(step_id):
    progress = {
        "phase": "executing",
        "steps": [
            {"step_id": step_id, "role": "executor", "status": "running"}
        ],
    }

    with pytest.raises(ValueError, match="step_id"):
        build_progress_event(
            relay_user_id="user-123",
            task_id=uuid.uuid4(),
            progress=progress,
        )


def test_build_progress_event_rejects_empty_owner():
    with pytest.raises(ValueError):
        build_progress_event(
            relay_user_id=" ",
            task_id=uuid.uuid4(),
            progress=valid_progress(),
        )


@pytest.mark.asyncio
async def test_publish_progress_publishes_only_validated_event():
    redis_client = type("RedisStub", (), {})()
    redis_client.publish = AsyncMock()
    task_id = uuid.uuid4()

    await publish_progress(
        redis_client,
        relay_user_id="user-123",
        task_id=task_id,
        progress=valid_progress(),
    )

    redis_client.publish.assert_awaited_once()
    channel, message = redis_client.publish.await_args.args
    assert channel == PROGRESS_CHANNEL
    event = json.loads(message)
    assert event["task_id"] == str(task_id)
    assert event["relay_user_id"] == "user-123"
    assert event["progress"] == valid_progress()
    assert "prompt" not in message
    assert "output" not in message


@pytest.mark.asyncio
async def test_publish_progress_rejects_invalid_event_before_redis_call():
    redis_client = type("RedisStub", (), {})()
    redis_client.publish = AsyncMock()

    with pytest.raises(ValueError):
        await publish_progress(
            redis_client,
            relay_user_id="user-123",
            task_id=uuid.uuid4(),
            progress={"phase": "executing", "steps": [], "output": "secret"},
        )

    redis_client.publish.assert_not_awaited()
