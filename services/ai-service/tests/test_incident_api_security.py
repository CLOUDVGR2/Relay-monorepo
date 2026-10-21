"""Tests for test incident api security in the Relay AI service."""


import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

VALID_TOKEN = "incident-test-internal-token"
USER_ID = "507f1f77bcf86cd799439011"


@pytest.fixture
def internal_token(monkeypatch):
    monkeypatch.setenv("PYTHON_AI_INTERNAL_TOKEN", VALID_TOKEN)


def test_incident_create_rejects_missing_internal_token(internal_token):
    response = client.post(
        "/v1/incidents",
        json={"scenario_id": "api-latency-spike-v1"},
        headers={"X-Relay-User-Id": USER_ID},
    )
    assert response.status_code == 401


def test_incident_create_rejects_invalid_internal_token(internal_token):
    response = client.post(
        "/v1/incidents",
        json={"scenario_id": "api-latency-spike-v1"},
        headers={
            "Authorization": "Bearer incorrect-token",
            "X-Relay-User-Id": USER_ID,
        },
    )
    assert response.status_code == 401


def test_incident_create_requires_relay_user_identity(internal_token):
    response = client.post(
        "/v1/incidents",
        json={"scenario_id": "api-latency-spike-v1"},
        headers={"Authorization": f"Bearer {VALID_TOKEN}"},
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "invalid_user_id",
    [
        "",
        "not-an-object-id",
        "507f1f77bcf86cd79943901",  # Too short
        "507f1f77bcf86cd79943901z",  # Non-hexadecimal character
    ],
)
def test_incident_create_rejects_invalid_relay_identity(
    internal_token, invalid_user_id
):
    response = client.post(
        "/v1/incidents",
        json={"scenario_id": "api-latency-spike-v1"},
        headers={
            "Authorization": f"Bearer {VALID_TOKEN}",
            "X-Relay-User-Id": invalid_user_id,
        },
    )
    assert response.status_code == 400


def test_incident_create_rejects_unsupported_scenario(internal_token):
    response = client.post(
        "/v1/incidents",
        json={"scenario_id": "real-production"},
        headers={
            "Authorization": f"Bearer {VALID_TOKEN}",
            "X-Relay-User-Id": USER_ID,
        },
    )
    assert response.status_code == 422
