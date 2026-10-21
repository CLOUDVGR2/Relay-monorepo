"""Tests for test rag api security in the Relay AI service."""


import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.agentops.routes import _get_or_create_tenant
from app.db.session import get_db
from app.main import app
from app.models.document import Document
from app.models.tenant import Tenant


client = TestClient(app)
VALID_TOKEN = "rag-test-internal-token"
USER_ID = "507f1f77bcf86cd799439011"


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
        ("get", "/v1/documents"),
        ("get", f"/v1/documents/{uuid.uuid4()}"),
        ("post", "/v1/documents"),
    ],
)
def test_document_routes_reject_missing_token(authenticated_api, method, path):
    request_kwargs = {"headers": {"X-Relay-User-Id": USER_ID}}
    if method == "post":
        request_kwargs["json"] = {
            "title": "Runbook",
            "content": "Check the service.",
        }
    response = getattr(client, method)(path, **request_kwargs)
    assert response.status_code == 401


def test_document_routes_require_relay_identity(authenticated_api):
    response = client.get(
        "/v1/documents",
        headers={"Authorization": f"Bearer {VALID_TOKEN}"},
    )
    assert response.status_code == 422


@pytest.mark.parametrize("invalid_id", ["bad-id", "", "507f1f77bcf86cd79943901z"])
def test_document_routes_reject_invalid_relay_identity(authenticated_api, invalid_id):
    response = client.get(
        "/v1/documents",
        headers={
            "Authorization": f"Bearer {VALID_TOKEN}",
            "X-Relay-User-Id": invalid_id,
        },
    )
    assert response.status_code == 400


def test_document_create_validates_input_before_database_access(authenticated_api):
    response = client.post(
        "/v1/documents",
        headers=headers(),
        json={"title": "  ", "content": "Some content"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_document_list_query_is_scoped_to_resolved_tenant(monkeypatch):
    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        name="Workspace",
        slug="workspace",
        relay_user_id=USER_ID,
    )
    db = MagicMock()
    result = MagicMock()
    result.all.return_value = []
    db.scalars = AsyncMock(return_value=result)

    async def fake_resolve_tenant(_db, _relay_user_id):
        return tenant

    monkeypatch.setattr(
        "app.rag.routes._get_or_create_tenant",
        fake_resolve_tenant,
    )
    statement = None

    async def capture_query(query):
        nonlocal statement
        statement = query
        return result

    db.scalars = AsyncMock(side_effect=capture_query)

    from app.rag.routes import list_documents

    response = await list_documents(
        relay_user_id=USER_ID,
        limit=20,
        offset=0,
        db=db,
    )

    assert response == []
    sql = str(statement.compile(compile_kwargs={"literal_binds": True}))
    assert "documents.tenant_id =" in sql
    assert tenant_id.hex in sql


@pytest.mark.asyncio
async def test_document_detail_query_is_scoped_to_resolved_tenant(monkeypatch):
    tenant_id = uuid.uuid4()
    document_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        name="Workspace",
        slug="workspace",
        relay_user_id=USER_ID,
    )
    db = MagicMock()
    db.scalar = AsyncMock(return_value=None)

    async def fake_resolve_tenant(_db, _relay_user_id):
        return tenant

    monkeypatch.setattr(
        "app.rag.routes._get_or_create_tenant",
        fake_resolve_tenant,
    )

    from fastapi import HTTPException
    from app.rag.routes import get_document

    with pytest.raises(HTTPException) as error:
        await get_document(
            document_id=document_id,
            relay_user_id=USER_ID,
            db=db,
        )

    assert error.value.status_code == 404
    statement = db.scalar.await_args.args[0]
    sql = str(statement.compile(compile_kwargs={"literal_binds": True}))
    assert "documents.id =" in sql
    assert "documents.tenant_id =" in sql
    assert tenant_id.hex in sql
    assert document_id.hex in sql


def test_document_search_rejects_missing_token(authenticated_api):
    response = client.post(
        "/v1/documents/search",
        headers={"X-Relay-User-Id": USER_ID},
        json={"query": "database timeout"},
    )
    assert response.status_code == 401


def test_document_search_requires_relay_identity(authenticated_api):
    response = client.post(
        "/v1/documents/search",
        headers={"Authorization": f"Bearer {VALID_TOKEN}"},
        json={"query": "database timeout"},
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"query": ""},
        {"query": "   "},
        {"query": "database timeout", "top_k": 0},
        {"query": "database timeout", "top_k": 21},
    ],
)
def test_document_search_rejects_invalid_payload(authenticated_api, payload):
    response = client.post(
        "/v1/documents/search",
        headers=headers(),
        json=payload,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_document_search_uses_resolved_tenant_and_preserves_citations(
    monkeypatch,
):
    from app.rag.retrieval import RetrievedChunk
    from app.rag.routes import search_documents
    from app.schemas.documents import DocumentSearchRequest

    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        name="Workspace",
        slug="workspace",
        relay_user_id=USER_ID,
    )
    chunk_id = uuid.uuid4()
    document_id = uuid.uuid4()

    async def fake_resolve_tenant(_db, relay_user_id):
        assert relay_user_id == USER_ID
        return tenant

    retrieval = AsyncMock(
        return_value=[
            RetrievedChunk(
                chunk_id=chunk_id,
                document_id=document_id,
                title="Database Runbook",
                source_uri="docs/database.md",
                content="Restart the database connection pool.",
                chunk_index=2,
                start=120,
                end=165,
                score=0.03,
            )
        ]
    )
    monkeypatch.setattr(
        "app.rag.routes._get_or_create_tenant",
        fake_resolve_tenant,
    )
    monkeypatch.setattr("app.rag.routes.retrieve_chunks", retrieval)

    response = await search_documents(
        payload=DocumentSearchRequest(
            query="database connection timeout",
            top_k=3,
        ),
        relay_user_id=USER_ID,
        db=MagicMock(),
    )

    assert response.query == "database connection timeout"
    assert len(response.results) == 1
    assert response.results[0].chunk_id == chunk_id
    assert response.results[0].document_id == document_id
    assert response.results[0].title == "Database Runbook"
    assert response.results[0].source_uri == "docs/database.md"
    assert response.results[0].start == 120
    assert response.results[0].end == 165
    retrieval.assert_awaited_once_with(
        retrieval.await_args.args[0],
        tenant_id=tenant_id,
        query="database connection timeout",
        top_k=3,
    )


@pytest.mark.asyncio
async def test_document_search_returns_controlled_embedding_error(monkeypatch):
    from fastapi import HTTPException

    from app.rag.embeddings import EmbeddingError
    from app.rag.routes import search_documents
    from app.schemas.documents import DocumentSearchRequest

    tenant = Tenant(
        id=uuid.uuid4(),
        name="Workspace",
        slug="workspace",
        relay_user_id=USER_ID,
    )

    async def fake_resolve_tenant(_db, _relay_user_id):
        return tenant

    async def failed_retrieval(*args, **kwargs):
        raise EmbeddingError("private internal service details")

    monkeypatch.setattr(
        "app.rag.routes._get_or_create_tenant",
        fake_resolve_tenant,
    )
    monkeypatch.setattr("app.rag.routes.retrieve_chunks", failed_retrieval)

    with pytest.raises(HTTPException) as error:
        await search_documents(
            payload=DocumentSearchRequest(query="database timeout"),
            relay_user_id=USER_ID,
            db=MagicMock(),
        )

    assert error.value.status_code == 502
    assert "private internal service details" not in error.value.detail


def test_document_answer_rejects_missing_token(authenticated_api):
    response = client.post(
        "/v1/documents/answer",
        headers={"X-Relay-User-Id": USER_ID},
        json={"question": "What does the runbook recommend?"},
    )
    assert response.status_code == 401


def test_document_answer_requires_relay_identity(authenticated_api):
    response = client.post(
        "/v1/documents/answer",
        headers={"Authorization": f"Bearer {VALID_TOKEN}"},
        json={"question": "What does the runbook recommend?"},
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"question": ""},
        {"question": "   "},
        {"question": "How do I recover?", "top_k": 0},
        {"question": "How do I recover?", "top_k": 21},
    ],
)
def test_document_answer_rejects_invalid_payload(authenticated_api, payload):
    response = client.post(
        "/v1/documents/answer",
        headers=headers(),
        json=payload,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_document_answer_uses_tenant_and_returns_validated_citations(
    monkeypatch,
):
    from unittest.mock import AsyncMock

    from app.rag.answering import GroundedAnswer
    from app.rag.retrieval import RetrievedChunk
    from app.rag.routes import answer_documents
    from app.schemas.documents import DocumentAnswerRequest

    tenant_id = uuid.uuid4()
    tenant = Tenant(
        id=tenant_id,
        name="Workspace",
        slug="workspace",
        relay_user_id=USER_ID,
    )
    chunk = RetrievedChunk(
        chunk_id=uuid.uuid4(),
        document_id=uuid.uuid4(),
        title="Database Runbook",
        source_uri="docs/database.md",
        content="Restart the database connection pool.",
        chunk_index=2,
        start=120,
        end=165,
        score=0.03,
    )

    async def fake_resolve_tenant(_db, relay_user_id):
        assert relay_user_id == USER_ID
        return tenant

    answer_mock = AsyncMock(
        return_value=GroundedAnswer(
            answer="Restart the connection pool.",
            citations=[chunk],
        )
    )
    monkeypatch.setattr(
        "app.rag.routes._get_or_create_tenant",
        fake_resolve_tenant,
    )
    monkeypatch.setattr("app.rag.routes.answer_question", answer_mock)

    response = await answer_documents(
        payload=DocumentAnswerRequest(
            question="How do I recover the database connection?",
            top_k=3,
        ),
        relay_user_id=USER_ID,
        db=MagicMock(),
    )

    assert response.answer == "Restart the connection pool."
    assert len(response.citations) == 1
    citation = response.citations[0]
    assert citation.chunk_id == chunk.chunk_id
    assert citation.document_id == chunk.document_id
    assert citation.title == "Database Runbook"
    assert citation.source_uri == "docs/database.md"
    assert citation.start == 120
    assert citation.end == 165
    answer_mock.assert_awaited_once_with(
        answer_mock.await_args.args[0],
        tenant_id=tenant_id,
        question="How do I recover the database connection?",
        top_k=3,
    )


@pytest.mark.asyncio
async def test_document_answer_returns_controlled_service_error(monkeypatch):
    from fastapi import HTTPException

    from app.rag.answering import AnsweringError
    from app.rag.routes import answer_documents
    from app.schemas.documents import DocumentAnswerRequest

    tenant = Tenant(
        id=uuid.uuid4(),
        name="Workspace",
        slug="workspace",
        relay_user_id=USER_ID,
    )

    async def fake_resolve_tenant(_db, _relay_user_id):
        return tenant

    async def failed_answer(*args, **kwargs):
        raise AnsweringError("private model service details")

    monkeypatch.setattr(
        "app.rag.routes._get_or_create_tenant",
        fake_resolve_tenant,
    )
    monkeypatch.setattr("app.rag.routes.answer_question", failed_answer)

    with pytest.raises(HTTPException) as error:
        await answer_documents(
            payload=DocumentAnswerRequest(question="What happened?"),
            relay_user_id=USER_ID,
            db=MagicMock(),
        )

    assert error.value.status_code == 502
    assert "private model service details" not in error.value.detail
