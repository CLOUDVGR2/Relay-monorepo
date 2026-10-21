"""Runtime configuration for the Relay AI service."""


import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    service_name: str = "atlas-ai"
    app_version: str = "0.2.0"
    ai_provider: str = "mock"
    ai_provider_api_key: str = ""
    internal_api_token: str = ""


def get_settings() -> Settings:
    return Settings(
        ai_provider=os.getenv("AI_PROVIDER", "mock"),
        ai_provider_api_key=os.getenv("AI_PROVIDER_API_KEY", ""),
        internal_api_token=os.getenv("PYTHON_AI_INTERNAL_TOKEN", ""),
    )
