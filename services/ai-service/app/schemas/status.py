"""Status module for the Relay AI service."""


from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    service: str


class AIStatusResponse(BaseModel):
    service: str
    provider: str
    configured: bool
