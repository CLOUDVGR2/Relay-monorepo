"""Security and validation tests for conversation analysis."""

import json

from fastapi.testclient import TestClient

from app.main import app

VALID_TOKEN = "conversation-analysis-test-token"
USER_ID = "507f1f77bcf86cd799439011"
ENDPOINT = "/v1/conversations/analyze"

client = TestClient(app)


def test_analysis_rejects_missing_internal_token(monkeypatch):
    # Internal AI endpoints must not be callable by unauthenticated clients.
    monkeypatch.setenv("PYTHON_AI_INTERNAL_TOKEN", VALID_TOKEN)

    response = client.post(
        ENDPOINT,
        headers={"X-Relay-User-Id": USER_ID},
        json={"messages": [{"sender": "Alex", "text": "Ship the fix Friday."}]},
    )

    assert response.status_code == 401


def test_analysis_accepts_internal_request_without_user_identity(
    monkeypatch,
):
    # NestJS verifies membership; Python authenticates the internal service.
    monkeypatch.setenv("PYTHON_AI_INTERNAL_TOKEN", VALID_TOKEN)

    from app.agentops import conversation_routes

    async def fake_analysis(messages):
        return {
            "summary": "The team plans to ship the fix Friday.",
            "decisions": ["Ship Friday"],
            "action_items": [],
        }

    monkeypatch.setattr(
        conversation_routes,
        "analyze_conversation",
        fake_analysis,
    )

    response = client.post(
        ENDPOINT,
        headers={"Authorization": f"Bearer {VALID_TOKEN}"},
        json={"messages": [{"sender": "Alex", "text": "Ship the fix Friday."}]},
    )

    assert response.status_code == 200
    assert response.json()["summary"] == (
        "The team plans to ship the fix Friday."
    )



def test_analysis_rejects_oversized_transcript(monkeypatch):
    # Bound input size before it reaches the model to control resource use.
    monkeypatch.setenv("PYTHON_AI_INTERNAL_TOKEN", VALID_TOKEN)

    response = client.post(
        ENDPOINT,
        headers={"Authorization": f"Bearer {VALID_TOKEN}"},
        json={
            "messages": [
                {"sender": "Alex", "text": "x" * 5000}
                for _ in range(11)
            ]
        },
    )

    assert response.status_code == 422


def test_analysis_sanitizes_malformed_model_output(monkeypatch):
    # Never expose raw model output or internal exceptions to API callers.
    monkeypatch.setenv("PYTHON_AI_INTERNAL_TOKEN", VALID_TOKEN)

    from app.agentops import conversation_analysis

    async def malformed_output(*, system_prompt: str, user_prompt: str) -> str:
        return "not valid JSON"

    class FakeClient:
        generate = staticmethod(malformed_output)

    monkeypatch.setattr(
        conversation_analysis,
        "OllamaGenerationClient",
        lambda: FakeClient(),
    )

    response = client.post(
        ENDPOINT,
        headers={"Authorization": f"Bearer {VALID_TOKEN}"},
        json={"messages": [{"sender": "Alex", "text": "Ship the fix Friday."}]},
    )

    assert response.status_code == 502
    assert response.json()["detail"] == (
        "Conversation analysis failed. Check the local AI service."
    )
    assert "not valid JSON" not in response.text


def test_analysis_response_schema_rejects_unexpected_fields():
    # Strict response schemas prevent unexpected model-generated data leaking
    # into the application's trusted structured output.
    from pydantic import ValidationError

    from app.schemas.conversation_analysis import ConversationAnalysisResponse

    try:
        ConversationAnalysisResponse.model_validate(
            {
                "summary": "The team agreed to ship the fix.",
                "decisions": [],
                "action_items": [],
                "internal_notes": "unexpected",
            }
        )
    except ValidationError:
        pass
    else:
        raise AssertionError("Unexpected response fields should be rejected")
