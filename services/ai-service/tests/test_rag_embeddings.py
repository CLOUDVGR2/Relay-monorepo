"""Tests for test rag embeddings in the Relay AI service."""


import httpx
import pytest

import app.rag.embeddings as embeddings
from app.rag.embeddings import (
    EmbeddingError,
    LiteLLMEmbeddingClient,
    OllamaEmbeddingClient,
)


@pytest.fixture
def ollama_response(monkeypatch):
    original_client = httpx.AsyncClient

    def install(payload, status_code=200):
        def handler(request):
            assert request.url.path == "/api/embeddings"
            assert request.read()
            return httpx.Response(status_code, json=payload)

        transport = httpx.MockTransport(handler)

        def client_factory(*args, **kwargs):
            kwargs["transport"] = transport
            return original_client(*args, **kwargs)

        monkeypatch.setattr(embeddings.httpx, "AsyncClient", client_factory)

    return install


@pytest.mark.asyncio
async def test_valid_embedding_is_returned(ollama_response):
    ollama_response({"embedding": [0.25] * 768})

    result = await OllamaEmbeddingClient().embed("Relay RAG")

    assert len(result) == 768
    assert result[0] == 0.25


@pytest.mark.asyncio
async def test_wrong_dimensions_are_rejected(ollama_response):
    ollama_response({"embedding": [0.1] * 10})

    with pytest.raises(EmbeddingError, match="Expected 768"):
        await OllamaEmbeddingClient().embed("Relay RAG")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "bad_value",
    [float("nan"), float("inf"), True, "bad"],
)
async def test_invalid_vector_values_are_rejected(ollama_response, bad_value):
    vector = [0.1] * 768
    vector[5] = bad_value
    ollama_response({"embedding": vector})

    with pytest.raises(EmbeddingError):
        await OllamaEmbeddingClient().embed("Relay RAG")


@pytest.mark.asyncio
async def test_http_error_is_reported(ollama_response):
    ollama_response({"error": "model unavailable"}, status_code=500)

    with pytest.raises(EmbeddingError, match="request failed"):
        await OllamaEmbeddingClient().embed("Relay RAG")


@pytest.mark.asyncio
async def test_missing_vector_is_rejected(ollama_response):
    ollama_response({})

    with pytest.raises(EmbeddingError, match="embedding vector"):
        await OllamaEmbeddingClient().embed("Relay RAG")


@pytest.mark.asyncio
async def test_empty_input_is_rejected():
    with pytest.raises(ValueError, match="must not be empty"):
        await OllamaEmbeddingClient().embed("   ")


@pytest.mark.asyncio
async def test_non_string_input_is_rejected():
    with pytest.raises(TypeError, match="must be a string"):
        await OllamaEmbeddingClient().embed(None)




def test_embedding_factory_selects_litellm(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "litellm")
    assert isinstance(
        embeddings.get_embedding_client(),
        LiteLLMEmbeddingClient,
    )


@pytest.mark.parametrize("provider", ["mock", ""])
def test_embedding_factory_preserves_ollama_default(monkeypatch, provider):
    monkeypatch.setenv("AI_PROVIDER", provider)
    assert isinstance(
        embeddings.get_embedding_client(),
        OllamaEmbeddingClient,
    )


def test_embedding_factory_defaults_to_ollama_when_unset(monkeypatch):
    monkeypatch.delenv("AI_PROVIDER", raising=False)
    assert isinstance(
        embeddings.get_embedding_client(),
        OllamaEmbeddingClient,
    )


def test_invalid_configuration_is_rejected():
    with pytest.raises(ValueError):
        OllamaEmbeddingClient(timeout=0)

    with pytest.raises(ValueError):
        OllamaEmbeddingClient(dimensions=0)

@pytest.mark.asyncio
async def test_litellm_embedding_is_returned(monkeypatch):
    from types import SimpleNamespace
    import litellm

    captured = {}

    async def fake_aembedding(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(
            data=[SimpleNamespace(embedding=[0.25] * 768)]
        )

    monkeypatch.setattr(litellm, "aembedding", fake_aembedding)

    result = await LiteLLMEmbeddingClient(
        api_key="test-key",
        model="openai/text-embedding-3-small",
    ).embed("Relay RAG")

    assert len(result) == 768
    assert result[0] == 0.25
    assert captured["model"] == "openai/text-embedding-3-small"
    assert captured["input"] == ["Relay RAG"]
    assert captured["dimensions"] == 768
    assert captured["api_key"] == "test-key"


@pytest.mark.asyncio
async def test_litellm_provider_error_is_reported(monkeypatch):
    import litellm

    async def fake_aembedding(**kwargs):
        raise RuntimeError("simulated provider failure")

    monkeypatch.setattr(litellm, "aembedding", fake_aembedding)

    with pytest.raises(EmbeddingError, match="request failed"):
        await LiteLLMEmbeddingClient().embed("Relay RAG")


@pytest.mark.asyncio
async def test_litellm_wrong_dimensions_are_rejected(monkeypatch):
    from types import SimpleNamespace
    import litellm

    async def fake_aembedding(**kwargs):
        return SimpleNamespace(
            data=[SimpleNamespace(embedding=[0.1] * 10)]
        )

    monkeypatch.setattr(litellm, "aembedding", fake_aembedding)

    with pytest.raises(EmbeddingError, match="Expected 768"):
        await LiteLLMEmbeddingClient().embed("Relay RAG")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "bad_value",
    [float("nan"), float("inf"), True, "bad"],
)
async def test_litellm_invalid_vector_values_are_rejected(monkeypatch, bad_value):
    from types import SimpleNamespace
    import litellm

    vector = [0.1] * 768
    vector[5] = bad_value

    async def fake_aembedding(**kwargs):
        return SimpleNamespace(data=[SimpleNamespace(embedding=vector)])

    monkeypatch.setattr(litellm, "aembedding", fake_aembedding)

    with pytest.raises(EmbeddingError):
        await LiteLLMEmbeddingClient().embed("Relay RAG")


@pytest.mark.asyncio
async def test_litellm_empty_input_is_rejected():
    with pytest.raises(ValueError, match="must not be empty"):
        await LiteLLMEmbeddingClient().embed("   ")


@pytest.mark.asyncio
async def test_litellm_non_string_input_is_rejected():
    with pytest.raises(TypeError, match="must be a string"):
        await LiteLLMEmbeddingClient().embed(None)


def test_litellm_invalid_configuration_is_rejected():
    with pytest.raises(ValueError):
        LiteLLMEmbeddingClient(timeout=0)

    with pytest.raises(ValueError):
        LiteLLMEmbeddingClient(timeout=float("nan"))

    with pytest.raises(ValueError):
        LiteLLMEmbeddingClient(dimensions=0)

    with pytest.raises(ValueError):
        LiteLLMEmbeddingClient(dimensions=768.5)
