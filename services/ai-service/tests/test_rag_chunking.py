"""Tests for test rag chunking in the Relay AI service."""


import pytest

from app.rag.chunking import chunk_text


def test_empty_and_whitespace_input_return_no_chunks():
    assert chunk_text("") == []
    assert chunk_text("   \n\t  ") == []


def test_short_text_returns_one_chunk():
    chunks = chunk_text("Relay investigates incidents.")

    assert len(chunks) == 1
    assert chunks[0].index == 0
    assert chunks[0].content == "Relay investigates incidents."
    assert chunks[0].start == 0
    assert chunks[0].end == len("Relay investigates incidents.")


def test_long_text_is_split_into_bounded_chunks():
    text = " ".join(f"word{i}" for i in range(100))
    chunks = chunk_text(text, chunk_size=80, overlap=10)

    assert len(chunks) > 1
    assert [chunk.index for chunk in chunks] == list(range(len(chunks)))
    assert all(len(chunk.content) <= 80 for chunk in chunks)
    assert all(chunk.start < chunk.end for chunk in chunks)


def test_overlapping_chunks_retain_shared_source_text():
    text = "alpha beta gamma delta epsilon zeta eta theta"
    chunks = chunk_text(text, chunk_size=24, overlap=8)

    assert len(chunks) > 1
    assert any(
        left.start < right.start < left.end
        for left, right in zip(chunks, chunks[1:])
    )


@pytest.mark.parametrize(
    ("chunk_size", "overlap"),
    [
        (0, 0),
        (-1, 0),
        (10, -1),
        (10, 10),
        (10, 11),
    ],
)
def test_invalid_chunk_settings_are_rejected(chunk_size, overlap):
    with pytest.raises(ValueError):
        chunk_text("some text", chunk_size=chunk_size, overlap=overlap)


def test_non_string_input_is_rejected():
    with pytest.raises(TypeError):
        chunk_text(None)


def test_chunker_prefers_paragraph_boundaries():
    first_paragraph = "A" * 35
    second_paragraph = "B" * 30
    text = first_paragraph + "\n\n" + second_paragraph + "\n\n" + "C" * 30

    chunks = chunk_text(text, chunk_size=75, overlap=5)

    assert len(chunks) > 1
    assert chunks[0].content.startswith(first_paragraph)
    assert len(chunks[0].content) <= 75


def test_acceptance_criteria_heading_and_checklist_stay_together():
    text = (
        "11. Acceptance Criteria for the Knowledge Workflow\n"
        "1. Documents can be ingested successfully.\n"
        "2. Search returns relevant passages.\n"
        "3. Results remain tenant-scoped.\n"
    )

    chunks = chunk_text(text, chunk_size=300, overlap=30)

    assert len(chunks) == 1
    assert "Acceptance Criteria" in chunks[0].content
    assert "Documents can be ingested successfully" in chunks[0].content
    assert "Results remain tenant-scoped" in chunks[0].content
