"""Documents module for the Relay AI service."""


import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DocumentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    content: str = Field(min_length=1, max_length=1_000_000)
    source_uri: str | None = Field(default=None, max_length=2048)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title must not be empty")
        return value

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("content must not be empty")
        return value


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    title: str
    source_uri: str | None
    status: str
    created_at: datetime


class DocumentSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    top_k: int = Field(default=5, ge=1, le=20)

    @field_validator("query")
    @classmethod
    def validate_query(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("query must not be empty")
        return value


class RetrievedChunkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    chunk_id: uuid.UUID
    document_id: uuid.UUID
    title: str
    source_uri: str | None
    content: str
    chunk_index: int
    start: int | None
    end: int | None
    score: float


class DocumentSearchResponse(BaseModel):
    query: str
    results: list[RetrievedChunkResponse]


class DocumentAnswerRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    top_k: int = Field(default=5, ge=1, le=20)

    @field_validator("question")
    @classmethod
    def validate_question(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("question must not be empty")
        return value


class AnswerCitationResponse(BaseModel):
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    title: str
    content: str
    source_uri: str | None
    chunk_index: int
    start: int | None
    end: int | None


class DocumentAnswerResponse(BaseModel):
    answer: str
    citations: list[AnswerCitationResponse]
