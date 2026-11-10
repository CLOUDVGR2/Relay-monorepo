"""Best-effort Redis publication of safe multi-agent progress snapshots."""

import json
import uuid
from typing import Any

PROGRESS_CHANNEL = "relay:multi-agent:progress:v1"
MAX_PROGRESS_STEPS = 12

_ALLOWED_PHASES = {"planning", "executing", "reviewing", "completed", "failed"}
_ALLOWED_ROLES = {"planner", "researcher", "executor", "memory", "writer", "analyst", "reviewer", "coordinator"}
_ALLOWED_STATUSES = {"pending", "running", "completed", "failed", "skipped"}
_STEP_KEYS = {"step_id", "role", "status"}


def build_progress_event(
    *,
    relay_user_id: str,
    task_id: uuid.UUID | str,
    progress: dict[str, Any],
) -> dict[str, Any]:
    """Build a strictly bounded event; reject fields that could leak model output."""
    if not isinstance(relay_user_id, str) or not relay_user_id.strip():
        raise ValueError("relay_user_id must be a non-empty string")

    if not isinstance(progress, dict) or set(progress) != {"phase", "steps"}:
        raise ValueError("progress must contain only phase and steps")

    phase = progress["phase"]
    steps = progress["steps"]

    if phase not in _ALLOWED_PHASES:
        raise ValueError("invalid progress phase")
    if not isinstance(steps, list) or len(steps) > MAX_PROGRESS_STEPS:
        raise ValueError("progress steps must be a list of at most 12 items")

    safe_steps = []
    seen_ids: set[str] = set()
    for step in steps:
        if not isinstance(step, dict) or set(step) != _STEP_KEYS:
            raise ValueError("invalid progress step shape")

        step_id = step["step_id"]
        role = step["role"]
        status = step["status"]
        if (
            not isinstance(step_id, str)
            or not 1 <= len(step_id) <= 64
            or not step_id.isascii()
            or not step_id.replace("_", "").replace("-", "").isalnum()
            or not step_id[0].islower()
        ):
            raise ValueError("invalid step_id")
        if step_id in seen_ids:
            raise ValueError("duplicate step_id")
        if role not in _ALLOWED_ROLES or status not in _ALLOWED_STATUSES:
            raise ValueError("invalid step role or status")

        seen_ids.add(step_id)
        safe_steps.append({
            "step_id": step_id,
            "role": role,
            "status": status,
        })

    return {
        "version": 1,
        "task_id": str(task_id),
        "relay_user_id": relay_user_id,
        "progress": {"phase": phase, "steps": safe_steps},
    }


async def publish_progress(
    redis_client: Any,
    *,
    relay_user_id: str,
    task_id: uuid.UUID | str,
    progress: dict[str, Any],
) -> None:
    """Publish one validated event. Call only after its DB transaction commits."""
    event = build_progress_event(
        relay_user_id=relay_user_id,
        task_id=task_id,
        progress=progress,
    )
    await redis_client.publish(
        PROGRESS_CHANNEL,
        json.dumps(event, separators=(",", ":"), ensure_ascii=True),
    )
