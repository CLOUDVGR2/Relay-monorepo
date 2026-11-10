"""HTTP route handlers for routes in the Relay AI service."""


from fastapi import APIRouter, HTTPException, Security
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.core.openapi import INTERNAL_ERROR_RESPONSES, error_response
from app.core.security import require_internal_token
from app.db.session import engine
from app.schemas.status import AIStatusResponse, HealthResponse

router = APIRouter()


@router.get("/healthz", response_model=HealthResponse, tags=["health"],
    summary='Get Service Health',
    description='Reports basic application health without checking external dependencies. Intended for container and process liveness probes.',
    response_description='The service is responding.',
)
def health():
    return HealthResponse(status="ok", service="python-ai")


async def _database_is_available() -> bool:
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        return True
    except SQLAlchemyError:
        return False


@router.get(
    "/readyz",
    response_model=HealthResponse,
    tags=["health"],
    responses={503: error_response("Database unavailable.")},

    summary='Check Service Readiness',
    description='Checks whether the AI service can accept traffic by verifying database connectivity. A failed dependency check returns HTTP 503.',
    response_description='The service is ready to accept requests.',
)
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
    responses=INTERNAL_ERROR_RESPONSES,

    summary='Get AI Provider Status',
    description='Returns the configured AI provider, service identifier, and whether the provider API credentials are configured. Does not expose secrets. Requires the internal bearer token.',
    response_description='Returns AI provider configuration status without exposing credentials.',
)
def ai_status():
    settings = get_settings()
    return AIStatusResponse(
        service=settings.service_name,
        provider=settings.ai_provider,
        configured=bool(settings.ai_provider_api_key),
    )
