"""Authenticated RAG API with owner-scoped management and shared retrieval."""

import re
import uuid

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Security
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agentops.routes import _get_or_create_tenant
from app.core.openapi import TENANT_ERROR_RESPONSES, error_response
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


def _validate_relay_user_id(relay_user_id: str) -> None:
    """Require an authenticated Relay identity without resolving a private tenant."""
    if not re.fullmatch(r"[0-9a-fA-F]{24}", relay_user_id):
        raise HTTPException(status_code=400, detail="Invalid Relay user identity")


router = APIRouter(
    prefix="/v1/documents",
    tags=["rag-documents"],
    dependencies=[Security(require_internal_token)],
    responses=TENANT_ERROR_RESPONSES,
)


@router.post(
    "",
    response_model=DocumentResponse,
    status_code=201,
    responses={502: error_response("Document ingestion or embedding failed.")},

    summary='Ingest Document',
    description='Creates a document in the tenant workspace and processes its content for retrieval. Document ingestion includes the configured embedding workflow. The document is associated with the tenant resolved from X-Relay-User-Id.',
    response_description='The newly ingested document and its processing status.',
)
async def create_document(
    payload: DocumentCreate = Body(description="Document content and metadata to ingest into the authenticated tenant's document collection."),
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


@router.post(
    "/search",
    response_model=DocumentSearchResponse,
    responses={502: error_response("Document search or embedding failed.")},

    summary='Search Documents',
    description='Performs semantic retrieval across documents uploaded by authenticated Relay users. The query is embedded and used to retrieve the most relevant content chunks. top_k defaults to 5 and must be between 1 and 20. Results include relevance scores and source document metadata.',
    response_description='The search query and its ranked matching document chunks.',
)
async def search_documents(
    payload: DocumentSearchRequest = Body(description='Semantic search query and the maximum number of relevant content chunks to retrieve. top_k defaults to 5 and ranges from 1 to 20.'),
    relay_user_id: str = Header(alias="X-Relay-User-Id"),
    db: AsyncSession = Depends(get_db),
):
    _validate_relay_user_id(relay_user_id)

    try:
        results = await retrieve_chunks(
            db,
            tenant_id=None,
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


@router.post(
    "/answer",
    response_model=DocumentAnswerResponse,
    responses={502: error_response("Grounded answer generation failed.")},

    summary='Answer Using Documents',
    description="Generates an answer using relevant content retrieved across authenticated Relay users' document collections. The response includes citations identifying the source documents and content chunks. top_k defaults to 5 and must be between 1 and 20.",
    response_description='The generated answer and its supporting document citations.',
)
async def answer_documents(
    payload: DocumentAnswerRequest = Body(description="Question to answer using the authenticated tenant's document collection and the maximum number of supporting chunks to retrieve."),
    relay_user_id: str = Header(alias="X-Relay-User-Id"),
    db: AsyncSession = Depends(get_db),
):
    _validate_relay_user_id(relay_user_id)

    try:
        result = await answer_question(
            db,
            tenant_id=None,
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
            uploaded_by_id=chunk.uploaded_by_id,
            start=chunk.start,
            end=chunk.end,
        )
        for chunk in result.citations
    ]

    return DocumentAnswerResponse(
        answer=result.answer,
        citations=citations,
    )


@router.get("", response_model=list[DocumentResponse],
    summary='List Documents',
    description='Returns documents belonging only to the tenant resolved from X-Relay-User-Id. Results are ordered by creation time, newest first, with document UUID as a secondary ordering key. Supports pagination using limit and offset. limit defaults to 20 and ranges from 1 to 100.',
    response_description='The requested page of tenant-scoped documents.',
)
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


@router.get(
    "/{document_id}",
    response_model=DocumentResponse,
    responses={404: error_response("Document not found.")},

    summary='Get Document',
    description='Retrieves a document by UUID within the tenant resolved from X-Relay-User-Id. Documents belonging to other tenants are not exposed.',
    response_description='The requested tenant-scoped document.',
)
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
