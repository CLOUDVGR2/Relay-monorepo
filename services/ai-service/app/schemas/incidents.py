"""Incidents module for the Relay AI service."""


import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field


class IncidentCreate(BaseModel):
    scenario_id: Literal["api-latency-spike-v1"] = "api-latency-spike-v1"


class IncidentResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    title: str
    service: str
    status: str
    investigation: dict[str, Any] | None = None
    action: dict[str, Any] | None = None
    result: dict[str, Any] | None = None
    created_at: Any


class ApprovalResponse(BaseModel):
    incident_id: uuid.UUID
    status: str
    approval_token: str
    expires_at: Any


class ExecuteRequest(BaseModel):
    approval_token: str = Field(min_length=32, max_length=256)
