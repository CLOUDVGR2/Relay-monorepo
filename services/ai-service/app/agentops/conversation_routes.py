"""Internal API for structured conversation analysis."""

from fastapi import APIRouter, Body, HTTPException, Security

from app.agentops.conversation_analysis import analyze_conversation
from app.core.openapi import INTERNAL_ERROR_RESPONSES, error_response
from app.core.security import require_internal_token
from app.schemas.conversation_analysis import (
    ConversationAnalysisRequest,
    ConversationAnalysisResponse,
)

router = APIRouter(
    prefix="/v1/conversations",
    tags=["conversation-analysis"],
    dependencies=[Security(require_internal_token)],
    responses=INTERNAL_ERROR_RESPONSES,
)


@router.post(
    "/analyze",
    response_model=ConversationAnalysisResponse,
    responses={502: error_response("Conversation analysis failed.")},

    summary='Analyze Conversation',
    description='Analyzes a supplied conversation transcript and returns a structured summary, decisions, and follow-up action items. Accepts between 1 and 100 messages, with a maximum aggregate transcript size of 50,000 characters. Requires internal bearer authentication.',
    response_description='The structured conversation analysis.',
)
async def analyze_conversation_route(
    payload: ConversationAnalysisRequest = Body(description='Conversation transcript to analyze. Supply 1 to 100 messages. Each message contains a sender and text, and the aggregate transcript is limited to 50,000 characters.'),
):
    try:
        return await analyze_conversation(payload.messages)
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail="Conversation analysis failed. Check the local AI service.",
        ) from exc
