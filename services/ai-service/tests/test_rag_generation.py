"""Tests for test rag generation in the Relay AI service."""


import json

import httpx
import pytest

import app.rag.generation as generation
from app.rag.generation import GenerationError, OllamaGenerationClient


@pytest.fixture
def install_transport(monkeypatch):
    original_client = httpx.AsyncClient

    def install(handler):
        transport = httpx.MockTransport(handler)

        def client_factory(*args, **kwargs):
            kwargs["transport"] = transport
            return original_client(*args, **kwargs)

        monkeypatch.setattr(
            generation.httpx,
            "AsyncClient",
            client_factory,
        )

    return install


@pytest.mark.asyncio
async def test_local_generation_returns_answer(install_transport):
    def handler(request):
        assert request.url.path == "/api/chat"
        return httpx.Response(
            200,
            json={
                "message": {
                    "role": "assistant",
                    "content": "  Check queue depth first.  ",
                }
            },
        )

    install_transport(handler)
    client = OllamaGenerationClient()

    result = await client.generate(
        system_prompt="Answer using evidence.",
        user_prompt="What should be checked?",
    )

    assert result == "Check queue depth first."


@pytest.mark.asyncio
async def test_generation_sends_configured_model_and_prompts(
    install_transport,
):
    def handler(request):
        body = json.loads(request.read())
        assert body["model"] == "qwen2.5:3b-instruct"
        assert body["stream"] is False
        assert body["messages"] == [
            {"role": "system", "content": "System rules"},
            {"role": "user", "content": "Question"},
        ]
        return httpx.Response(
            200,
            json={"message": {"content": "Grounded answer"}},
        )

    install_transport(handler)
    client = OllamaGenerationClient()

    result = await client.generate(
        system_prompt="System rules",
        user_prompt="Question",
    )

    assert result == "Grounded answer"


@pytest.mark.asyncio
async def test_generation_http_error_is_sanitized(install_transport):
    def handler(request):
        return httpx.Response(503, json={"error": "private service detail"})

    install_transport(handler)

    with pytest.raises(GenerationError, match="request failed") as error:
        await OllamaGenerationClient().generate(
            system_prompt="Rules",
            user_prompt="Question",
        )

    assert "private service detail" not in str(error.value)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"message": None},
        {"message": {"content": ""}},
        {"message": {"content": "   "}},
    ],
)
async def test_invalid_generation_responses_are_rejected(
    install_transport,
    payload,
):
    install_transport(
        lambda request: httpx.Response(200, json=payload)
    )

    with pytest.raises(GenerationError):
        await OllamaGenerationClient().generate(
            system_prompt="Rules",
            user_prompt="Question",
        )


@pytest.mark.asyncio
async def test_empty_prompts_are_rejected_before_http(install_transport):
    install_transport(
        lambda request: pytest.fail("HTTP must not be called")
    )
    client = OllamaGenerationClient()

    with pytest.raises(ValueError, match="system_prompt"):
        await client.generate(system_prompt=" ", user_prompt="Question")

    with pytest.raises(ValueError, match="user_prompt"):
        await client.generate(system_prompt="Rules", user_prompt=" ")




def test_generation_factory_selects_litellm(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "litellm")
    client = generation.get_generation_client()
    assert isinstance(client, generation.LiteLLMGenerationClient)


@pytest.mark.parametrize("provider", ["mock", ""])
def test_generation_factory_preserves_ollama_default(monkeypatch, provider):
    monkeypatch.setenv("AI_PROVIDER", provider)
    client = generation.get_generation_client()
    assert isinstance(client, generation.OllamaGenerationClient)


def test_generation_factory_defaults_to_ollama_when_unset(monkeypatch):
    monkeypatch.delenv("AI_PROVIDER", raising=False)
    assert isinstance(
        generation.get_generation_client(),
        generation.OllamaGenerationClient,
    )


def test_invalid_generation_configuration_is_rejected():
    with pytest.raises(ValueError, match="HTTP or HTTPS"):
        OllamaGenerationClient(base_url="ftp://localhost")

    with pytest.raises(ValueError, match="model"):
        OllamaGenerationClient(model=" ")

    with pytest.raises(ValueError, match="timeout"):
        OllamaGenerationClient(timeout=0)
