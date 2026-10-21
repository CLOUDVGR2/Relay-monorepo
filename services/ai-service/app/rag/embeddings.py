"""Local text embeddings powered by Ollama."""

import math
import os
from collections.abc import Sequence

import httpx


class EmbeddingError(RuntimeError):
    """Raised when an embedding cannot be generated or validated."""


class OllamaEmbeddingClient:
    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float = 20.0,
        dimensions: int = 768,
    ) -> None:
        self.base_url = (
            base_url or os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
        ).rstrip("/")
        self.model = model or os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text")
        self.timeout = timeout
        self.dimensions = dimensions

        if not self.base_url.startswith(("http://", "https://")):
            raise ValueError("base_url must use HTTP or HTTPS")
        if not self.model.strip():
            raise ValueError("model must not be empty")
        if timeout <= 0:
            raise ValueError("timeout must be positive")
        if dimensions < 1:
            raise ValueError("dimensions must be positive")

    async def embed(self, text: str) -> list[float]:
        if not isinstance(text, str):
            raise TypeError("text must be a string")

        text = text.strip()
        if not text:
            raise ValueError("text must not be empty")

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/embeddings",
                    json={"model": self.model, "prompt": text},
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise EmbeddingError("Ollama embedding request failed") from exc

        if not isinstance(payload, dict):
            raise EmbeddingError("Ollama returned an invalid response")

        vector = payload.get("embedding")
        if not isinstance(vector, Sequence) or isinstance(vector, (str, bytes)):
            raise EmbeddingError("Ollama response did not contain an embedding vector")

        if len(vector) != self.dimensions:
            raise EmbeddingError(
                f"Expected {self.dimensions} embedding dimensions, got {len(vector)}"
            )

        result: list[float] = []
        for value in vector:
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise EmbeddingError("Embedding contains a non-numeric value")

            number = float(value)
            if not math.isfinite(number):
                raise EmbeddingError("Embedding contains a non-finite value")

            result.append(number)

        return result
