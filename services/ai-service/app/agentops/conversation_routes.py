"""Internal API for structured conversation analysis."""

from fastapi import APIRouter, HTTPException, Security

from app.agentops.conversation_analysis import analyze_conversation
from app.core.security import require_internal_token
from app.schemas.conversation_analysis import (
    ConversationAnalysisRequest,
    ConversationAnalysisResponse,
)

router = APIRouter(
    prefix="/v1/conversations",
    tags=["conversation-analysis"],
    dependencies=[Security(require_internal_token)],
)


@router.post("/analyze", response_model=ConversationAnalysisResponse)
async def analyze_conversation_route(
    payload: ConversationAnalysisRequest,
):
    try:
        return await analyze_conversation(payload.messages)
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail="Conversation analysis failed. Check the local AI service.",
        ) from exc
