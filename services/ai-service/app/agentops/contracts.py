"""Contracts module for the Relay AI service."""


from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Evidence(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: str = Field(min_length=1, max_length=120)
    type: str = Field(min_length=1, max_length=60)
    source: str = Field(min_length=1, max_length=200)
    observation: str = Field(min_length=1, max_length=2000)
    supports: list[str] = Field(default_factory=list, max_length=30)


class Signal(StrictModel):
    metric: str = Field(min_length=1, max_length=200)
    baseline_ms: float = Field(ge=0)
    observed_ms: float = Field(ge=0)
    threshold_ms: float = Field(gt=0)


class InvestigationContext(StrictModel):
    scenario_id: Literal["api-latency-spike-v1"]
    service: str = Field(min_length=1, max_length=200)
    signal: Signal
    evidence: list[Evidence] = Field(min_length=1, max_length=100)


class Hypothesis(StrictModel):
    id: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=1000)
    confidence: float = Field(ge=0, le=1)
    evidence_ids: list[str] = Field(min_length=1, max_length=30)


class RemediationRecommendation(StrictModel):
    action_id: Literal["simulate_pool_recovery"]
    description: str = Field(min_length=1, max_length=1000)
    risk: Literal["low", "medium", "high"]
    execution_environment: Literal["simulator"]


class InvestigationResult(StrictModel):
    summary: str = Field(min_length=1, max_length=3000)
    hypotheses: list[Hypothesis] = Field(min_length=1, max_length=20)
    proposed_action: RemediationRecommendation
    limitations: list[str] = Field(default_factory=list, max_length=30)
