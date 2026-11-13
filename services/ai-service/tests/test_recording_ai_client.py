"""Tests for the recording worker's authenticated AI-service client."""

import httpx
import pytest

import app.recordings.ai_client as ai_client
from app.schemas.conversation_analysis import ConversationAnalysisMessage


@pytest.fixture
def install_transport(monkeypatch):
    original_client = httpx.AsyncClient

    def install(handler):
        transport = httpx.MockTransport(handler)

        def client_factory(*args, **kwargs):
            kwargs["transport"] = transport
            return original_client(*args, **kwargs)

        monkeypatch.setattr(ai_client.httpx, "AsyncClient", client_factory)

    return install


@pytest.mark.asyncio
async def test_analysis_sends_authenticated_transcript_and_validates_response(
    monkeypatch, install_transport
):
    monkeypatch.setenv("PYTHON_AI_BASE_URL", "http://python-ai:8000/")
    monkeypatch.setenv("PYTHON_AI_INTERNAL_TOKEN", "test-internal-token")

    def handler(request):
        assert request.method == "POST"
        assert request.url == "http://python-ai:8000/v1/conversations/analyze"
        assert request.headers["Authorization"] == "Bearer test-internal-token"
        assert request.read() == (
            b'{"messages":[{"sender":"Alex","text":"Ship Friday."}]}'
        )
        return httpx.Response(
            200,
            json={
                "summary": "The team will ship Friday.",
                "decisions": ["Ship Friday"],
                "action_items": [],
            },
        )

    install_transport(handler)
    result = await ai_client.analyze_conversation([
        ConversationAnalysisMessage(sender="Alex", text="Ship Friday.")
    ])

    assert result.summary == "The team will ship Friday."
    assert result.decisions == ["Ship Friday"]
    assert result.action_items == []


@pytest.mark.asyncio
async def test_analysis_rejects_missing_configuration(monkeypatch):
    monkeypatch.delenv("PYTHON_AI_BASE_URL", raising=False)
    monkeypatch.delenv("PYTHON_AI_INTERNAL_TOKEN", raising=False)

    with pytest.raises(RuntimeError, match="configuration is missing"):
        await ai_client.analyze_conversation([
            ConversationAnalysisMessage(sender="Alex", text="Ship Friday.")
        ])


@pytest.mark.asyncio
async def test_analysis_sanitizes_http_errors(
    monkeypatch, install_transport
):
    monkeypatch.setenv("PYTHON_AI_BASE_URL", "http://python-ai:8000")
    monkeypatch.setenv("PYTHON_AI_INTERNAL_TOKEN", "test-internal-token")

    def handler(request):
        return httpx.Response(503, text="sensitive upstream diagnostic")

    install_transport(handler)

    with pytest.raises(RuntimeError, match="service request failed") as error:
        await ai_client.analyze_conversation([
            ConversationAnalysisMessage(sender="Alex", text="Ship Friday.")
        ])

    assert "sensitive upstream diagnostic" not in str(error.value)


@pytest.mark.asyncio
async def test_analysis_rejects_invalid_response_schema(
    monkeypatch, install_transport
):
    monkeypatch.setenv("PYTHON_AI_BASE_URL", "http://python-ai:8000")
    monkeypatch.setenv("PYTHON_AI_INTERNAL_TOKEN", "test-internal-token")

    def handler(request):
        return httpx.Response(200, json={"summary": "Valid summary", "unexpected": "field"})

    install_transport(handler)

    with pytest.raises(RuntimeError, match="service request failed"):
        await ai_client.analyze_conversation([
            ConversationAnalysisMessage(sender="Alex", text="Ship Friday.")
        ])


@pytest.mark.asyncio
async def test_analysis_rejects_non_json_response(
    monkeypatch, install_transport
):
    monkeypatch.setenv("PYTHON_AI_BASE_URL", "http://python-ai:8000")
    monkeypatch.setenv("PYTHON_AI_INTERNAL_TOKEN", "test-internal-token")

    def handler(request):
        return httpx.Response(200, text="not-json")

    install_transport(handler)

    with pytest.raises(RuntimeError, match="service request failed"):
        await ai_client.analyze_conversation([
            ConversationAnalysisMessage(sender="Alex", text="Ship Friday.")
        ])
