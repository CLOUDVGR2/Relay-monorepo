"""Reusable OpenAPI response definitions."""

from app.schemas.errors import ErrorResponse


def error_response(description: str) -> dict:
    """Describe the standard HTTP exception response."""
    return {
        "model": ErrorResponse,
        "description": description,
    }


INTERNAL_ERROR_RESPONSES = {
    401: error_response(
        "Missing, invalid, or unconfigured internal bearer token."
    ),
}

TENANT_ERROR_RESPONSES = {
    **INTERNAL_ERROR_RESPONSES,
    400: error_response(
        "The X-Relay-User-Id header is not a valid Relay user identity."
    ),
    409: error_response(
        "The tenant workspace or requested resource conflicts with its current state."
    ),
}
