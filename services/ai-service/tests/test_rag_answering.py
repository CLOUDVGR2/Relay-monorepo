"""Tests for test rag answering in the Relay AI service."""


import json
import uuid
from unittest.mock import AsyncMock
from unittest.mock import AsyncMock
from unittest.mock import AsyncMock
from unittest.mock import AsyncMock

import pytest

import app.rag.answering as answering
from app.rag.answering import (
    ABSTENTION_MESSAGE,
    AnsweringError,
    answer_question,
)
from app.rag.retrieval import RetrievedChunk


def make_chunk():
    return RetrievedChunk(
        chunk_id=uuid.uuid4(),
        document_id=uuid.uuid4(),
        title="Operations Runbook",
        source_uri="internal://runbook",
        content="Check queue depth before restarting the worker.",
        chunk_index=0,
        start=0,
        end=52,
        score=0.03,
    )


class FakeGenerator:
    def __init__(self, response):
        self.response = response
        self.system_prompt = None
        self.user_prompt = None

    async def generate(self, *, system_prompt, user_prompt):
        self.system_prompt = system_prompt
        self.user_prompt = user_prompt
        return self.response


@pytest.mark.asyncio
async def test_answer_returns_only_server_verified_citations(monkeypatch):
    chunk = make_chunk()
    generator = FakeGenerator(json.dumps({
        "answer": "Check queue depth first.",
        "cited_chunk_ids": [str(chunk.chunk_id), str(uuid.uuid4())],
    }))
    monkeypatch.setattr(answering, "retrieve_chunks", AsyncMock(return_value=[chunk]))

    result = await answer_question(
        object(),
        tenant_id=uuid.uuid4(),
        question="What should I check?",
        generator=generator,
    )

    assert result.answer == "Check queue depth first."
    assert result.citations == [chunk]
    assert str(chunk.chunk_id) in generator.user_prompt
    assert "untrusted" in generator.system_prompt.lower()
    assert "Public browser-facing routes are Express routes" in generator.system_prompt
    assert "Internal Python document-service routes" in generator.system_prompt
    assert "Do not describe an internal Python route as a public Express endpoint" in generator.system_prompt


@pytest.mark.asyncio
async def test_no_retrieved_evidence_abstains_without_generation(monkeypatch):
    def fail_generation(*args, **kwargs):
        pytest.fail("Generation should not run without evidence")

    monkeypatch.setattr(answering, "retrieve_chunks", AsyncMock(return_value=[]))

    result = await answer_question(
        object(),
        tenant_id=uuid.uuid4(),
        question="What happened?",
        generator=FakeGenerator(fail_generation),
    )

    assert result.answer == ABSTENTION_MESSAGE
    assert result.citations == []


@pytest.mark.asyncio
async def test_unverified_only_citations_force_abstention(monkeypatch):
    chunk = make_chunk()
    generator = FakeGenerator(json.dumps({
        "answer": "An unsupported claim.",
        "cited_chunk_ids": [str(uuid.uuid4())],
    }))
    monkeypatch.setattr(answering, "retrieve_chunks", AsyncMock(return_value=[chunk]))

    result = await answer_question(
        object(),
        tenant_id=uuid.uuid4(),
        question="What happened?",
        generator=generator,
    )

    assert result.answer == ABSTENTION_MESSAGE
    assert result.citations == []


@pytest.mark.asyncio
@pytest.mark.parametrize("response", ["not json", "[]", '{"answer": ""}', '{"answer":"x","cited_chunk_ids":"bad"}'])
async def test_invalid_model_responses_are_rejected(monkeypatch, response):
    chunk = make_chunk()
    monkeypatch.setattr(answering, "retrieve_chunks", AsyncMock(return_value=[chunk]))

    with pytest.raises(AnsweringError):
        await answer_question(
            object(),
            tenant_id=uuid.uuid4(),
            question="What happened?",
            generator=FakeGenerator(response),
        )


@pytest.mark.asyncio
async def test_empty_question_is_rejected():
    with pytest.raises(ValueError, match="empty"):
        await answer_question(
            object(),
            tenant_id=uuid.uuid4(),
            question="   ",
            generator=FakeGenerator("{}"),
        )
