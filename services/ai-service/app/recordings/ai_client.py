"""Authenticated HTTP client for conversation analysis."""

import os

import httpx
from pydantic import ValidationError

from app.schemas.conversation_analysis import (
    ConversationAnalysisMessage,
    ConversationAnalysisResponse,
)


async def analyze_conversation(
    messages: list[ConversationAnalysisMessage],
) -> ConversationAnalysisResponse:
    """Send a validated transcript to the internal Python AI API."""
    base_url = os.getenv("PYTHON_AI_BASE_URL", "").strip().rstrip("/")
    token = os.getenv("PYTHON_AI_INTERNAL_TOKEN", "").strip()

    if not base_url or not token:
        raise RuntimeError("Conversation analysis service configuration is missing")

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{base_url}/v1/conversations/analyze",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "messages": [
                        message.model_dump(mode="json")
                        for message in messages
                    ]
                },
            )
            response.raise_for_status()
            payload = response.json()
            return ConversationAnalysisResponse.model_validate(payload)
    except (httpx.HTTPError, ValueError, ValidationError) as exc:
        raise RuntimeError("Conversation analysis service request failed") from exc
