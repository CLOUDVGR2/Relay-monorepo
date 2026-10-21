"""Tests for test rag ingestion in the Relay AI service."""


import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.document import Document, DocumentChunk
from app.rag.ingestion import (
    DocumentIngestionError,
    ingest_document,
)


class FakeEmbedder:
    def __init__(self, fail_on_call: int | None = None):
        self.calls = 0
        self.fail_on_call = fail_on_call

    async def embed(self, text: str) -> list[float]:
        self.calls += 1
        if self.calls == self.fail_on_call:
            raise RuntimeError("simulated embedding failure")
        return [0.1] * 768


def make_db(*, tenant_exists: bool = True):
    db = MagicMock()
    db.scalar = AsyncMock(
        return_value=uuid.uuid4() if tenant_exists else None
    )
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.refresh = AsyncMock()
    return db


@pytest.mark.asyncio
async def test_ingestion_persists_document_and_chunks():
    tenant_id = uuid.uuid4()
    db = make_db()
    db.scalar.return_value = tenant_id
    embedder = FakeEmbedder()

    document = await ingest_document(
        db,
        tenant_id=tenant_id,
        title="Incident runbook",
        content="Restart the worker. Then verify queue health.",
        embedder=embedder,
    )

    assert isinstance(document, Document)
    assert document.tenant_id == tenant_id
    assert document.title == "Incident runbook"
    db.flush.assert_awaited_once()
    db.commit.assert_awaited_once()
    db.rollback.assert_not_awaited()
    db.refresh.assert_awaited_once_with(document)

    added = [call.args[0] for call in db.add.call_args_list]
    chunks = [item for item in added if isinstance(item, DocumentChunk)]

    assert len(chunks) == 1
    assert chunks[0].tenant_id == tenant_id
    assert chunks[0].document_id == document.id
    assert chunks[0].chunk_index == 0
    assert chunks[0].embedding == [0.1] * 768
    assert chunks[0].metadata_json["start"] == 0
    assert chunks[0].metadata_json["end"] == len(
        "Restart the worker. Then verify queue health."
    )


@pytest.mark.asyncio
async def test_ingestion_rejects_unknown_tenant():
    db = make_db(tenant_exists=False)

    with pytest.raises(ValueError, match="tenant does not exist"):
        await ingest_document(
            db,
            tenant_id=uuid.uuid4(),
            title="Runbook",
            content="Check the service.",
            embedder=FakeEmbedder(),
        )

    db.add.assert_not_called()
    db.commit.assert_not_awaited()
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_embedding_failure_rolls_back_without_persisting_document():
    tenant_id = uuid.uuid4()
    db = make_db()
    db.scalar.return_value = tenant_id

    with pytest.raises(RuntimeError, match="simulated embedding failure"):
        await ingest_document(
            db,
            tenant_id=tenant_id,
            title="Long runbook",
            content="abcdefghij",
            chunk_size=5,
            overlap=0,
            embedder=FakeEmbedder(fail_on_call=2),
        )

    db.add.assert_not_called()
    db.commit.assert_not_awaited()
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_ingestion_rejects_wrong_embedding_dimensions():
    tenant_id = uuid.uuid4()
    db = make_db()
    db.scalar.return_value = tenant_id

    class WrongDimensionEmbedder:
        async def embed(self, text: str) -> list[float]:
            return [0.1] * 12

    with pytest.raises(DocumentIngestionError, match="768 embedding dimensions"):
        await ingest_document(
            db,
            tenant_id=tenant_id,
            title="Runbook",
            content="Check the service.",
            embedder=WrongDimensionEmbedder(),
        )

    db.add.assert_not_called()
    db.commit.assert_not_awaited()
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_ingestion_rejects_empty_title_and_content():
    db = make_db()

    with pytest.raises(ValueError, match="title must not be empty"):
        await ingest_document(
            db,
            tenant_id=uuid.uuid4(),
            title="  ",
            content="Some content",
            embedder=FakeEmbedder(),
        )

    with pytest.raises(ValueError, match="content must not be empty"):
        await ingest_document(
            db,
            tenant_id=uuid.uuid4(),
            title="Runbook",
            content="   ",
            embedder=FakeEmbedder(),
        )

    db.scalar.assert_not_awaited()
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_embedding_finishes_before_tenant_lookup():
    tenant_id = uuid.uuid4()
    events = []

    db = make_db()
    db.scalar = AsyncMock(
        side_effect=lambda *_args, **_kwargs: events.append("tenant_lookup")
        or tenant_id
    )

    class OrderedEmbedder:
        async def embed(self, text: str) -> list[float]:
            events.append("embedding")
            return [0.1] * 768

    await ingest_document(
        db,
        tenant_id=tenant_id,
        title="Runbook",
        content="Check the service.",
        embedder=OrderedEmbedder(),
    )

    assert events == ["embedding", "tenant_lookup"]
