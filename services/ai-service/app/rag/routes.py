"""Authenticated, tenant-scoped document API for RAG."""

import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Security
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agentops.routes import _get_or_create_tenant
from app.core.security import require_internal_token
from app.db.session import get_db
from app.models.document import Document
from app.rag.answering import AnsweringError, answer_question
from app.rag.embeddings import EmbeddingError
from app.rag.ingestion import DocumentIngestionError, ingest_document
from app.rag.retrieval import retrieve_chunks
from app.schemas.documents import (
    AnswerCitationResponse,
    DocumentAnswerRequest,
    DocumentAnswerResponse,
    DocumentCreate,
    DocumentResponse,
    DocumentSearchRequest,
    DocumentSearchResponse,
)


router = APIRouter(
    prefix="/v1/documents",
    tags=["rag-documents"],
    dependencies=[Security(require_internal_token)],
)


@router.post("", response_model=DocumentResponse, status_code=201)
async def create_document(
    payload: DocumentCreate,
    relay_user_id: str = Header(alias="X-Relay-User-Id"),
    db: AsyncSession = Depends(get_db),
):
    tenant = await _get_or_create_tenant(db, relay_user_id)

    try:
        document = await ingest_document(
            db,
            tenant_id=tenant.id,
            title=payload.title,
            content=payload.content,
            source_uri=payload.source_uri,
        )
    except (EmbeddingError, DocumentIngestionError) as exc:
        raise HTTPException(
            status_code=502,
            detail="Document processing failed. Check the local embedding service.",
        ) from exc

    return document


@router.post("/search", response_model=DocumentSearchResponse)
async def search_documents(
    payload: DocumentSearchRequest,
    relay_user_id: str = Header(alias="X-Relay-User-Id"),
    db: AsyncSession = Depends(get_db),
):
    tenant = await _get_or_create_tenant(db, relay_user_id)

    try:
        results = await retrieve_chunks(
            db,
            tenant_id=tenant.id,
            query=payload.query,
            top_k=payload.top_k,
        )
    except EmbeddingError as exc:
        raise HTTPException(
            status_code=502,
            detail="Document search failed. Check the local embedding service.",
        ) from exc

    return DocumentSearchResponse(
        query=payload.query,
        results=results,
    )


@router.post("/answer", response_model=DocumentAnswerResponse)
async def answer_documents(
    payload: DocumentAnswerRequest,
    relay_user_id: str = Header(alias="X-Relay-User-Id"),
    db: AsyncSession = Depends(get_db),
):
    tenant = await _get_or_create_tenant(db, relay_user_id)

    try:
        result = await answer_question(
            db,
            tenant_id=tenant.id,
            question=payload.question,
            top_k=payload.top_k,
        )
    except (EmbeddingError, AnsweringError) as exc:
        raise HTTPException(
            status_code=502,
            detail="Grounded answer generation failed. Check the local AI services.",
        ) from exc

    citations = [
        AnswerCitationResponse(
            chunk_id=chunk.chunk_id,
            document_id=chunk.document_id,
            title=chunk.title,
            content=chunk.content,
            source_uri=chunk.source_uri,
            chunk_index=chunk.chunk_index,
            start=chunk.start,
            end=chunk.end,
        )
        for chunk in result.citations
    ]

    return DocumentAnswerResponse(
        answer=result.answer,
        citations=citations,
    )


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    relay_user_id: str = Header(alias="X-Relay-User-Id"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    tenant = await _get_or_create_tenant(db, relay_user_id)

    result = await db.scalars(
        select(Document)
        .where(Document.tenant_id == tenant.id)
        .order_by(Document.created_at.desc(), Document.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.all()


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: uuid.UUID,
    relay_user_id: str = Header(alias="X-Relay-User-Id"),
    db: AsyncSession = Depends(get_db),
):
    tenant = await _get_or_create_tenant(db, relay_user_id)

    document = await db.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.tenant_id == tenant.id,
        )
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")

    return document
