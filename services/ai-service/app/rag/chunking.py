"""Deterministic text chunking for the local RAG pipeline."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class TextChunk:
    index: int
    content: str
    start: int
    end: int


def chunk_text(
    text: str,
    *,
    chunk_size: int = 1200,
    overlap: int = 150,
) -> list[TextChunk]:
    """Split text into bounded, overlapping chunks with source offsets."""
    if not isinstance(text, str):
        raise TypeError("text must be a string")

    if chunk_size < 1:
        raise ValueError("chunk_size must be positive")

    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("overlap must be non-negative and smaller than chunk_size")

    start = 0
    chunks: list[TextChunk] = []
    text_length = len(text)

    while start < text_length:
        end = min(start + chunk_size, text_length)

        # Prefer paragraph, line, sentence, then word boundaries.
        if end < text_length:
            window_start = start + chunk_size // 2
            paragraph_boundary = text.rfind("\n\n", window_start, end)
            line_boundary = text.rfind("\n", window_start, end)

            if paragraph_boundary > start:
                end = paragraph_boundary + 2
            elif line_boundary > start:
                end = line_boundary + 1
            else:
                sentence_boundary = max(
                    text.rfind(". ", window_start, end),
                    text.rfind("! ", window_start, end),
                    text.rfind("? ", window_start, end),
                )
                if sentence_boundary > start:
                    end = sentence_boundary + 1
                else:
                    boundary = text.rfind(" ", window_start, end)
                    if boundary > start:
                        end = boundary

        content = text[start:end].strip()

        if content:
            chunks.append(
                TextChunk(
                    index=len(chunks),
                    content=content,
                    start=start,
                    end=end,
                )
            )

        if end >= text_length:
            break

        next_start = end - overlap
        start = next_start if next_start > start else end

    return chunks
