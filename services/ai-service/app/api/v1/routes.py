"""HTTP route handlers for routes in the Relay AI service."""


from fastapi import APIRouter, HTTPException, Security
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.core.security import require_internal_token
from app.db.session import engine
from app.schemas.status import AIStatusResponse, HealthResponse

router = APIRouter()


@router.get("/healthz", response_model=HealthResponse, tags=["health"])
def health():
    return HealthResponse(status="ok", service="python-ai")


async def _database_is_available() -> bool:
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        return True
    except SQLAlchemyError:
        return False


@router.get("/readyz", response_model=HealthResponse, tags=["health"])
async def readiness():
    if not await _database_is_available():
        raise HTTPException(
            status_code=503,
            detail="Database unavailable",
        )

    return HealthResponse(status="ready", service="atlas-ai")


@router.get(
    "/v1/ai/status",
    response_model=AIStatusResponse,
    tags=["ai"],
    dependencies=[Security(require_internal_token)],
)
def ai_status():
    settings = get_settings()
    return AIStatusResponse(
        service=settings.service_name,
        provider=settings.ai_provider,
        configured=bool(settings.ai_provider_api_key),
    )
