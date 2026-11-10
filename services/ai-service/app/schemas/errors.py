"""Shared HTTP error response schemas."""

from pydantic import BaseModel


class ErrorResponse(BaseModel):
    """Default FastAPI HTTP exception response."""

    detail: str
