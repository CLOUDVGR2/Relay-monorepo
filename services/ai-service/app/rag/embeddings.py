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

class LiteLLMEmbeddingClient:
    """768-dimensional embeddings through LiteLLM."""

    def __init__(
        self,
        model: str | None = None,
        timeout: float = 20.0,
        dimensions: int = 768,
        api_key: str | None = None,
        api_base: str | None = None,
    ) -> None:
        self.model = (
            model or os.getenv(
                "LITELLM_EMBEDDING_MODEL",
                "text-embedding-3-small",
            )
        ).strip()
        self.timeout = timeout
        self.dimensions = dimensions
        self.api_key = (
            api_key if api_key is not None else os.getenv("AI_PROVIDER_API_KEY", "")
        ).strip()
        self.api_base = (
            api_base if api_base is not None else os.getenv("LITELLM_API_BASE", "")
        ).strip() or None

        if not self.model:
            raise ValueError("model must not be empty")
        if (
            isinstance(timeout, bool)
            or not isinstance(timeout, (int, float))
            or not math.isfinite(float(timeout))
            or timeout <= 0
        ):
            raise ValueError("timeout must be a finite positive number")
        if (
            isinstance(dimensions, bool)
            or not isinstance(dimensions, int)
            or dimensions < 1
        ):
            raise ValueError("dimensions must be a positive integer")
        if self.api_base and not self.api_base.startswith(("http://", "https://")):
            raise ValueError("api_base must use HTTP or HTTPS")

    async def embed(self, text: str) -> list[float]:
        if not isinstance(text, str):
            raise TypeError("text must be a string")

        text = text.strip()
        if not text:
            raise ValueError("text must not be empty")

        try:
            from litellm import aembedding

            response = await aembedding(
                model=self.model,
                input=[text],
                dimensions=self.dimensions,
                timeout=self.timeout,
                api_key=self.api_key or None,
                api_base=self.api_base,
            )
        except Exception as exc:
            raise EmbeddingError(
                "AI provider embedding request failed"
            ) from exc

        try:
            vector = response.data[0].embedding
        except (AttributeError, IndexError, KeyError, TypeError) as exc:
            raise EmbeddingError(
                "AI provider response did not contain an embedding vector"
            ) from exc

        if not isinstance(vector, Sequence) or isinstance(vector, (str, bytes)):
            raise EmbeddingError(
                "AI provider response did not contain an embedding vector"
            )

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


def get_embedding_client():
    """Select the RAG embedding provider independently from chat generation."""
    provider = os.getenv("EMBEDDING_PROVIDER", "").strip().lower()

    if provider == "ollama":
        return OllamaEmbeddingClient()
    if provider == "litellm":
        return LiteLLMEmbeddingClient()
    if provider:
        raise ValueError("EMBEDDING_PROVIDER must be either 'ollama' or 'litellm'")

    # Preserve the existing behavior when no embedding provider is configured.
    if os.getenv("AI_PROVIDER", "mock").strip().lower() == "litellm":
        return LiteLLMEmbeddingClient()
    return OllamaEmbeddingClient()
