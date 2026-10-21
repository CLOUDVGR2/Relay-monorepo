"""Tests for test health in the Relay AI service."""


import pytest
from fastapi.testclient import TestClient

from app.api.v1 import routes
from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "python-ai"}


@pytest.mark.anyio
async def test_readiness_when_database_is_available(monkeypatch):
    async def database_available():
        return True

    monkeypatch.setattr(routes, "_database_is_available", database_available)
    response = client.get("/readyz")
    assert response.status_code == 200
    assert response.json() == {"status": "ready", "service": "atlas-ai"}


@pytest.mark.anyio
async def test_readiness_when_database_is_unavailable(monkeypatch):
    async def database_unavailable():
        return False

    monkeypatch.setattr(routes, "_database_is_available", database_unavailable)
    response = client.get("/readyz")
    assert response.status_code == 503
    assert response.json() == {"detail": "Database unavailable"}


def test_ai_status_rejects_missing_token():
    response = client.get("/v1/ai/status")
    assert response.status_code == 401


def test_ai_status_rejects_invalid_token(monkeypatch):
    monkeypatch.setenv("PYTHON_AI_INTERNAL_TOKEN", "expected-test-token")
    response = client.get(
        "/v1/ai/status",
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert response.status_code == 401


def test_ai_status_accepts_valid_token(monkeypatch):
    monkeypatch.setenv("PYTHON_AI_INTERNAL_TOKEN", "expected-test-token")
    monkeypatch.setenv("AI_PROVIDER", "mock")
    monkeypatch.setenv("AI_PROVIDER_API_KEY", "test-secret")

    response = client.get(
        "/v1/ai/status",
        headers={"Authorization": "Bearer expected-test-token"},
    )

    assert response.status_code == 200
    assert response.json()["provider"] == "mock"
    assert response.json()["configured"] is True
    assert "test-secret" not in response.text
    assert "expected-test-token" not in response.text


def test_metrics_route_templates_and_error_counters(monkeypatch):
    from app.main import _request_counts

    monkeypatch.setenv("PYTHON_AI_INTERNAL_TOKEN", "metrics-test-token")

    health_response = client.get("/healthz")
    assert health_response.status_code == 200

    response = client.get(
        "/internal/metrics",
        headers={"Authorization": "Bearer metrics-test-token"},
    )
    assert response.status_code == 200

    payload = response.json()
    assert payload["scope"] == "process_local"

    health = next(
        item for item in payload["metrics"]
        if item["method"] == "GET" and item["route"] == "/healthz"
    )
    assert health["request_count"] >= 1
    assert "client_error_count" in health
    assert "server_error_count" in health

    assert ("GET", "/healthz") in _request_counts
    assert ("GET", "unmatched") not in _request_counts
