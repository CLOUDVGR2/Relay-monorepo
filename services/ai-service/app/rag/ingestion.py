"""Tenant-scoped document ingestion for the local RAG pipeline."""

import uuid
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document, DocumentChunk
from app.models.tenant import Tenant
from app.rag.chunking import chunk_text
from app.rag.embeddings import OllamaEmbeddingClient


MAX_DOCUMENT_CHARACTERS = 1_000_000
MAX_TITLE_LENGTH = 500
EMBEDDING_DIMENSIONS = 768


class EmbeddingProvider(Protocol):
    async def embed(self, text: str) -> list[float]:
        """Return a validated embedding for text."""


class DocumentIngestionError(RuntimeError):
    """Raised when document ingestion cannot be completed."""


async def ingest_document(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    title: str,
    content: str,
    source_uri: str | None = None,
    chunk_size: int = 1200,
    overlap: int = 150,
    embedder: EmbeddingProvider | None = None,
) -> Document:
    """Embed and persist a document and its chunks atomically."""
    if not isinstance(tenant_id, uuid.UUID):
        raise TypeError("tenant_id must be a UUID")

    if not isinstance(title, str) or not title.strip():
        raise ValueError("title must not be empty")

    title = title.strip()
    if len(title) > MAX_TITLE_LENGTH:
        raise ValueError(f"title must be at most {MAX_TITLE_LENGTH} characters")

    if not isinstance(content, str) or not content.strip():
        raise ValueError("content must not be empty")

    if len(content) > MAX_DOCUMENT_CHARACTERS:
        raise ValueError(
            f"content must be at most {MAX_DOCUMENT_CHARACTERS} characters"
        )

    if source_uri is not None and not isinstance(source_uri, str):
        raise TypeError("source_uri must be a string or None")

    chunks = chunk_text(
        content,
        chunk_size=chunk_size,
        overlap=overlap,
    )
    if not chunks:
        raise ValueError("content did not produce any chunks")

    embedding_client = embedder or OllamaEmbeddingClient()
    document_id = uuid.uuid4()

    try:
        # Complete external embedding calls before touching the database.
        vectors: list[list[float]] = []
        for chunk in chunks:
            vector = await embedding_client.embed(chunk.content)

            if len(vector) != EMBEDDING_DIMENSIONS:
                raise DocumentIngestionError(
                    f"Expected {EMBEDDING_DIMENSIONS} embedding dimensions, "
                    f"got {len(vector)}"
                )

            vectors.append(vector)

        tenant_exists = await db.scalar(
            select(Tenant.id).where(Tenant.id == tenant_id)
        )
        if tenant_exists is None:
            raise ValueError("tenant does not exist")

        document = Document(
            id=document_id,
            tenant_id=tenant_id,
            title=title,
            source_uri=source_uri,
            status="completed",
        )
        db.add(document)
        await db.flush()

        for chunk, vector in zip(chunks, vectors, strict=True):
            db.add(
                DocumentChunk(
                    tenant_id=tenant_id,
                    document_id=document_id,
                    chunk_index=chunk.index,
                    content=chunk.content,
                    embedding=vector,
                    metadata_json={
                        "start": chunk.start,
                        "end": chunk.end,
                    },
                )
            )

        await db.commit()
        await db.refresh(document)
        return document

    except Exception:
        await db.rollback()
        raise
