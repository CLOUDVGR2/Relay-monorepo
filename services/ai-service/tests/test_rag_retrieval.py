"""Tests for test rag retrieval in the Relay AI service."""


import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.dialects import postgresql

from app.rag.retrieval import retrieve_chunks


class FakeEmbedder:
    async def embed(self, text):
        assert text == "database connection timeout"
        return [0.1] * 768


def make_chunk(*, chunk_id=None, tenant_id=None, content="Relevant content"):
    return SimpleNamespace(
        id=chunk_id or uuid.uuid4(),
        document_id=uuid.uuid4(),
        tenant_id=tenant_id or uuid.uuid4(),
        chunk_index=0,
        content=content,
        metadata_json={"start": 10, "end": 40},
    )


@pytest.mark.asyncio
async def test_hybrid_retrieval_fuses_results_and_preserves_citations():
    tenant_id = uuid.uuid4()
    shared = make_chunk(tenant_id=tenant_id, content="Shared result")
    semantic_only = make_chunk(tenant_id=tenant_id, content="Semantic result")
    keyword_only = make_chunk(tenant_id=tenant_id, content="Keyword result")

    semantic_rows = [
        (shared, "Runbook", "docs/runbook.md", 0.1),
        (semantic_only, "Architecture", None, 0.2),
    ]
    keyword_rows = [
        (keyword_only, "Troubleshooting", "docs/errors.md", 0.8),
        (shared, "Runbook", "docs/runbook.md", 0.6),
    ]

    db = MagicMock()
    db.execute = AsyncMock(
        side_effect=[
            SimpleNamespace(all=lambda: semantic_rows),
            SimpleNamespace(all=lambda: keyword_rows),
        ]
    )

    results = await retrieve_chunks(
        db,
        tenant_id=tenant_id,
        query="database connection timeout",
        top_k=5,
        embedder=FakeEmbedder(),
    )

    assert len(results) == 3
    assert results[0].chunk_id == shared.id
    assert results[0].score == pytest.approx(1 / 61 + 1 / 62)
    assert results[0].title == "Runbook"
    assert results[0].source_uri == "docs/runbook.md"
    assert results[0].start == 10
    assert results[0].end == 40
    assert {result.chunk_id for result in results} == {
        shared.id,
        semantic_only.id,
        keyword_only.id,
    }


@pytest.mark.asyncio
async def test_hybrid_retrieval_queries_are_tenant_scoped():
    tenant_id = uuid.uuid4()
    db = MagicMock()
    db.execute = AsyncMock(
        side_effect=[
            SimpleNamespace(all=lambda: []),
            SimpleNamespace(all=lambda: []),
        ]
    )

    results = await retrieve_chunks(
        db,
        tenant_id=tenant_id,
        query="database connection timeout",
        embedder=FakeEmbedder(),
    )

    assert results == []
    assert db.execute.await_count == 2

    semantic_stmt = db.execute.await_args_list[0].args[0]
    keyword_stmt = db.execute.await_args_list[1].args[0]

    semantic_sql = str(
        semantic_stmt.compile(dialect=postgresql.dialect())
    )
    keyword_sql = str(
        keyword_stmt.compile(dialect=postgresql.dialect())
    )

    assert "document_chunks.tenant_id =" in semantic_sql
    assert "document_chunks.tenant_id =" in keyword_sql
    assert "<=>" in semantic_sql
    assert "@@" in keyword_sql
    assert "plainto_tsquery" in keyword_sql


@pytest.mark.asyncio
async def test_hybrid_retrieval_rejects_empty_query():
    db = MagicMock()

    with pytest.raises(ValueError, match="query must not be empty"):
        await retrieve_chunks(
            db,
            tenant_id=uuid.uuid4(),
            query="   ",
            embedder=FakeEmbedder(),
        )

    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_hybrid_retrieval_validates_top_k():
    db = MagicMock()

    with pytest.raises(ValueError, match="top_k must be between"):
        await retrieve_chunks(
            db,
            tenant_id=uuid.uuid4(),
            query="database connection timeout",
            top_k=100,
            embedder=FakeEmbedder(),
        )

    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_hybrid_retrieval_rejects_wrong_embedding_dimensions():
    class WrongEmbedder:
        async def embed(self, text):
            return [0.1] * 10

    db = MagicMock()

    with pytest.raises(ValueError, match="Expected 768"):
        await retrieve_chunks(
            db,
            tenant_id=uuid.uuid4(),
            query="database connection timeout",
            embedder=WrongEmbedder(),
        )

    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_retrieval_avoids_highly_overlapping_passages_when_alternatives_exist():
    tenant_id = uuid.uuid4()
    shared_document_id = uuid.uuid4()

    first = make_chunk(tenant_id=tenant_id, content="First passage")
    first.document_id = shared_document_id
    first.metadata_json = {"start": 0, "end": 1200}

    overlapping = make_chunk(tenant_id=tenant_id, content="Overlapping passage")
    overlapping.document_id = shared_document_id
    overlapping.metadata_json = {"start": 100, "end": 1100}

    alternative = make_chunk(tenant_id=tenant_id, content="Alternative evidence")
    alternative.metadata_json = {"start": 0, "end": 1000}

    semantic_rows = [
        (first, "Runbook", None, 0.1),
        (overlapping, "Runbook", None, 0.2),
        (alternative, "Architecture", None, 0.3),
    ]

    db = MagicMock()
    db.execute = AsyncMock(
        side_effect=[
            SimpleNamespace(all=lambda: semantic_rows),
            SimpleNamespace(all=lambda: []),
        ]
    )

    results = await retrieve_chunks(
        db,
        tenant_id=tenant_id,
        query="database connection timeout",
        top_k=2,
        embedder=FakeEmbedder(),
    )

    assert len(results) == 2
    assert results[0].chunk_id == first.id
    assert alternative.id in {result.chunk_id for result in results}
    assert overlapping.id not in {result.chunk_id for result in results}


@pytest.mark.asyncio
async def test_retrieval_keeps_distinct_passages_from_the_same_document():
    tenant_id = uuid.uuid4()
    document_id = uuid.uuid4()

    first = make_chunk(tenant_id=tenant_id, content="Connection setup")
    first.document_id = document_id
    first.metadata_json = {"start": 0, "end": 400}

    second = make_chunk(tenant_id=tenant_id, content="Timeout troubleshooting")
    second.document_id = document_id
    second.metadata_json = {"start": 500, "end": 900}
    second.chunk_index = 1

    db = MagicMock()
    db.execute = AsyncMock(
        side_effect=[
            SimpleNamespace(
                all=lambda: [
                    (first, "Runbook", "docs/runbook.md", 0.1),
                    (second, "Runbook", "docs/runbook.md", 0.2),
                ]
            ),
            SimpleNamespace(all=lambda: []),
        ]
    )

    results = await retrieve_chunks(
        db,
        tenant_id=tenant_id,
        query="database connection timeout",
        top_k=2,
        embedder=FakeEmbedder(),
    )

    assert [result.chunk_id for result in results] == [first.id, second.id]
    assert all(result.document_id == document_id for result in results)
    assert all(result.source_uri == "docs/runbook.md" for result in results)
