"""Tenant-scoped hybrid retrieval using pgvector and PostgreSQL full-text search."""

import math
import uuid
from dataclasses import dataclass
from typing import Protocol

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document, DocumentChunk
from app.rag.embeddings import OllamaEmbeddingClient


EMBEDDING_DIMENSIONS = 768
RRF_K = 60
MAX_TOP_K = 20


class QueryEmbeddingProvider(Protocol):
    async def embed(self, text: str) -> list[float]:
        """Generate an embedding for a search query."""


@dataclass(frozen=True, slots=True)
class RetrievedChunk:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    title: str
    source_uri: str | None
    content: str
    chunk_index: int
    start: int | None
    end: int | None
    score: float


def _has_substantial_overlap(left: RetrievedChunk, right: RetrievedChunk) -> bool:
    """Return whether two passages substantially overlap in the same document."""
    if left.document_id != right.document_id:
        return False

    if None in (left.start, left.end, right.start, right.end):
        return False

    left_length = left.end - left.start
    right_length = right.end - right.start

    if left_length <= 0 or right_length <= 0:
        return False

    overlap = min(left.end, right.end) - max(left.start, right.start)
    shorter_length = min(left_length, right_length)

    return overlap > 0 and overlap / shorter_length >= 0.5


async def retrieve_chunks(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    query: str,
    top_k: int = 5,
    embedder: QueryEmbeddingProvider | None = None,
) -> list[RetrievedChunk]:
    """Combine vector similarity and full-text rankings with reciprocal rank fusion."""
    if not isinstance(tenant_id, uuid.UUID):
        raise TypeError("tenant_id must be a UUID")

    if not isinstance(query, str) or not query.strip():
        raise ValueError("query must not be empty")

    query = query.strip()

    if isinstance(top_k, bool) or not isinstance(top_k, int):
        raise TypeError("top_k must be an integer")

    if not 1 <= top_k <= MAX_TOP_K:
        raise ValueError(f"top_k must be between 1 and {MAX_TOP_K}")

    # Retrieve extra candidates before combining rankings.
    candidate_k = min(top_k * 3, MAX_TOP_K)

    embedding_client = embedder or OllamaEmbeddingClient()
    query_vector = await embedding_client.embed(query)

    if len(query_vector) != EMBEDDING_DIMENSIONS:
        raise ValueError(
            f"Expected {EMBEDDING_DIMENSIONS} embedding dimensions, "
            f"got {len(query_vector)}"
        )

    if any(
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        for value in query_vector
    ):
        raise ValueError("Query embedding contains an invalid value")

    document_join = (
        (Document.id == DocumentChunk.document_id)
        & (Document.tenant_id == DocumentChunk.tenant_id)
    )

    distance = DocumentChunk.embedding.cosine_distance(query_vector)

    semantic_query = (
        select(
            DocumentChunk,
            Document.title,
            Document.source_uri,
            distance.label("distance"),
        )
        .join(Document, document_join)
        .where(
            DocumentChunk.tenant_id == tenant_id,
            DocumentChunk.embedding.is_not(None),
        )
        .order_by(distance.asc())
        .limit(candidate_k)
    )

    text_query = func.plainto_tsquery("english", query)
    text_rank = func.ts_rank_cd(
        DocumentChunk.search_vector,
        text_query,
    )

    keyword_query = (
        select(
            DocumentChunk,
            Document.title,
            Document.source_uri,
            text_rank.label("text_rank"),
        )
        .join(Document, document_join)
        .where(
            DocumentChunk.tenant_id == tenant_id,
            DocumentChunk.search_vector.op("@@")(text_query),
        )
        .order_by(text_rank.desc())
        .limit(candidate_k)
    )

    semantic_rows = (await db.execute(semantic_query)).all()
    keyword_rows = (await db.execute(keyword_query)).all()

    fused: dict[uuid.UUID, dict] = {}

    for rows in (semantic_rows, keyword_rows):
        for rank, row in enumerate(rows, start=1):
            chunk, title, source_uri = row[0], row[1], row[2]
            item = fused.setdefault(
                chunk.id,
                {
                    "chunk": chunk,
                    "title": title,
                    "source_uri": source_uri,
                    "score": 0.0,
                },
            )
            item["score"] += 1.0 / (RRF_K + rank)

    results = []
    for item in fused.values():
        chunk = item["chunk"]
        metadata = chunk.metadata_json or {}

        start = metadata.get("start")
        end = metadata.get("end")

        results.append(
            RetrievedChunk(
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                title=item["title"],
                source_uri=item["source_uri"],
                content=chunk.content,
                chunk_index=chunk.chunk_index,
                start=start if isinstance(start, int) else None,
                end=end if isinstance(end, int) else None,
                score=item["score"],
            )
        )

    results.sort(key=lambda result: (-result.score, str(result.chunk_id)))

    # Prefer non-redundant evidence while preserving the original ranking.
    selected = []
    deferred = []

    for candidate in results:
        if any(
            _has_substantial_overlap(candidate, chosen)
            for chosen in selected
        ):
            deferred.append(candidate)
        else:
            selected.append(candidate)

        if len(selected) >= top_k:
            break

    # If there are too few distinct passages, fill remaining slots with
    # the highest-ranked deferred passages rather than returning too few.
    if len(selected) < top_k:
        selected.extend(deferred[:top_k - len(selected)])

    return selected[:top_k]
