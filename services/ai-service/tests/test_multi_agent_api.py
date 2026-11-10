"""Security and behavior tests for the durable multi-agent task API."""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
VALID_TOKEN = "multi-agent-test-internal-token"
USER_ID = "507f1f77bcf86cd799439011"
BASE = "/v1/multi-agent/tasks"


@pytest.fixture
def authenticated_api(monkeypatch):
    monkeypatch.setenv("PYTHON_AI_INTERNAL_TOKEN", VALID_TOKEN)


def headers():
    return {
        "Authorization": f"Bearer {VALID_TOKEN}",
        "X-Relay-User-Id": USER_ID,
    }


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", BASE),
        ("post", BASE),
        ("get", f"{BASE}/{uuid.uuid4()}"),
    ],
)
def test_task_routes_reject_missing_internal_token(
    authenticated_api, method, path
):
    kwargs = {"headers": {"X-Relay-User-Id": USER_ID}}
    if method == "post":
        kwargs["json"] = {"prompt": "Summarize this incident."}

    response = getattr(client, method)(path, **kwargs)
    assert response.status_code == 401


def test_task_routes_require_relay_identity(authenticated_api):
    response = client.get(
        BASE,
        headers={"Authorization": f"Bearer {VALID_TOKEN}"},
    )
    assert response.status_code == 422


@pytest.mark.parametrize("invalid_id", ["bad-id", "", "507f1f77bcf86cd79943901z"])
def test_task_routes_reject_invalid_relay_identity(
    authenticated_api, invalid_id
):
    response = client.get(
        BASE,
        headers={
            "Authorization": f"Bearer {VALID_TOKEN}",
            "X-Relay-User-Id": invalid_id,
        },
    )
    assert response.status_code == 400


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"prompt": ""},
        {"prompt": "   "},
        {"prompt": "x" * 4001},
        {"prompt": "Do work", "max_steps": 0},
        {"prompt": "Do work", "max_steps": 13},
        {"prompt": "Do work", "timeout_seconds": 0},
        {"prompt": "Do work", "timeout_seconds": 241},
        {"prompt": "Do work", "unexpected": True},
    ],
)
def test_task_creation_rejects_invalid_payload_before_database_access(
    authenticated_api, payload
):
    response = client.post(BASE, headers=headers(), json=payload)
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("query", "expected_status"),
    [
        ("?limit=0", 422),
        ("?limit=101", 422),
        ("?offset=-1", 422),
    ],
)
def test_task_list_rejects_invalid_pagination(
    authenticated_api, query, expected_status
):
    response = client.get(BASE + query, headers=headers())
    assert response.status_code == expected_status


def make_task(*, tenant_id=None, task_id=None):
    now = datetime.now(UTC)
    task = MagicMock()
    task.id = task_id or uuid.uuid4()
    task.tenant_id = tenant_id or uuid.uuid4()
    task.status = "queued"
    task.progress_json = {}
    task.result_json = None
    task.error_code = None
    task.attempt_count = 0
    task.created_at = now
    task.updated_at = now
    task.started_at = None
    task.finished_at = None

    # Fields that must never be serialized in public responses.
    task.request_json = {"prompt": "private submitted prompt"}
    task.worker_id = "internal-worker"
    task.lease_expires_at = now
    return task


@pytest.mark.asyncio
async def test_create_task_resolves_tenant_and_persists_task(monkeypatch):
    from app.agentops.routes import _get_or_create_tenant
    from app.multi_agent.contracts import TaskRequest
    from app.multi_agent.repository import task_repository
    from app.multi_agent.routes import create_task
    from app.models.tenant import Tenant

    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        name="Workspace",
        slug="workspace",
        relay_user_id=USER_ID,
    )
    task = make_task(tenant_id=tenant_id)
    db = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    resolver = AsyncMock(return_value=tenant)
    create = AsyncMock(return_value=task)
    monkeypatch.setattr("app.multi_agent.routes._get_or_create_tenant", resolver)
    monkeypatch.setattr(task_repository, "create", create)

    response = await create_task(
        TaskRequest(prompt="Summarize this incident."),
        relay_user_id=USER_ID,
        db=db,
    )

    resolver.assert_awaited_once_with(db, USER_ID)
    create.assert_awaited_once_with(
        db,
        tenant_id=tenant_id,
        request=TaskRequest(prompt="Summarize this incident."),
    )
    db.commit.assert_awaited_once()
    db.refresh.assert_awaited_once_with(task)
    assert response.id == task.id
    assert response.status == "queued"


@pytest.mark.asyncio
async def test_list_tasks_passes_resolved_tenant_and_pagination(monkeypatch):
    from app.multi_agent.repository import task_repository
    from app.multi_agent.routes import list_tasks
    from app.models.tenant import Tenant

    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        name="Workspace",
        slug="workspace",
        relay_user_id=USER_ID,
    )
    task = make_task(tenant_id=tenant_id)
    db = MagicMock()

    monkeypatch.setattr(
        "app.multi_agent.routes._get_or_create_tenant",
        AsyncMock(return_value=tenant),
    )
    list_recent = AsyncMock(return_value=[task])
    monkeypatch.setattr(task_repository, "list_recent", list_recent)

    response = await list_tasks(
        relay_user_id=USER_ID,
        limit=10,
        offset=20,
        db=db,
    )

    list_recent.assert_awaited_once_with(
        db,
        tenant_id=tenant_id,
        limit=10,
        offset=20,
    )
    assert len(response) == 1
    assert response[0].id == task.id


@pytest.mark.asyncio
async def test_get_task_is_tenant_scoped_and_returns_404_when_missing(
    monkeypatch,
):
    from fastapi import HTTPException

    from app.multi_agent.repository import task_repository
    from app.multi_agent.routes import get_task
    from app.models.tenant import Tenant

    tenant_id = uuid.uuid4()
    task_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        name="Workspace",
        slug="workspace",
        relay_user_id=USER_ID,
    )
    db = MagicMock()

    monkeypatch.setattr(
        "app.multi_agent.routes._get_or_create_tenant",
        AsyncMock(return_value=tenant),
    )
    get = AsyncMock(return_value=None)
    monkeypatch.setattr(task_repository, "get", get)

    with pytest.raises(HTTPException) as exc:
        await get_task(
            task_id=task_id,
            relay_user_id=USER_ID,
            db=db,
        )

    assert exc.value.status_code == 404
    get.assert_awaited_once_with(
        db,
        tenant_id=tenant_id,
        task_id=task_id,
    )


def test_task_response_does_not_expose_internal_fields():
    from app.multi_agent.routes import _to_response

    task = make_task()
    response = _to_response(task)
    public_fields = response.model_dump().keys()

    assert "request_json" not in public_fields
    assert "worker_id" not in public_fields
    assert "lease_expires_at" not in public_fields
