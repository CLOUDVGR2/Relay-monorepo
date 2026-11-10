"""Regression tests for the generated Atlas AI OpenAPI contract."""

from app.main import app


def get_operations():
    schema = app.openapi()
    return {
        (method.upper(), path): operation
        for path, path_item in schema["paths"].items()
        for method, operation in path_item.items()
        if method in {"get", "post", "put", "patch", "delete"}
    }


def test_openapi_metadata_and_operation_inventory():
    schema = app.openapi()

    assert schema["openapi"].startswith("3.")
    assert schema["info"]["title"] == "Relay AI Service API"
    assert schema["info"]["version"] == "0.2.0"
    assert schema["info"]["summary"]
    assert "incident intelligence" in schema["info"]["description"].lower()
    assert "authentication" in schema["info"]["description"].lower()

    tag_descriptions = {
        tag["name"]: tag["description"]
        for tag in schema["tags"]
    }
    expected_tags = {
        "health",
        "ai",
        "incident-intelligence",
        "conversation-analysis",
        "rag-documents",
        "multi-agent",
        "observability",
    }
    assert expected_tags <= tag_descriptions.keys()
    assert all(tag_descriptions[name] for name in expected_tags)
    assert schema["paths"].keys() >= {
        "/healthz",
        "/readyz",
        "/v1/ai/status",
        "/v1/incidents",
        "/v1/incidents/{incident_id}",
        "/v1/incidents/{incident_id}/investigate",
        "/v1/incidents/{incident_id}/approve",
        "/v1/incidents/{incident_id}/execute",
        "/v1/incidents/{incident_id}/recover",
        "/v1/conversations/analyze",
        "/v1/documents",
        "/v1/documents/search",
        "/v1/documents/answer",
        "/v1/documents/{document_id}",
        "/v1/multi-agent/tasks",
        "/v1/multi-agent/tasks/{task_id}",
        "/internal/metrics",
    }

    operations = get_operations()
    assert len(operations) == 20

    for operation in operations.values():
        assert operation.get("summary")
        assert operation.get("tags")


def test_openapi_security_schemes_and_protected_operations():
    schema = app.openapi()
    operations = get_operations()

    assert schema["components"]["securitySchemes"]["HTTPBearer"] == {
        "type": "http",
        "scheme": "bearer",
    }

    public_operations = {
        ("GET", "/healthz"),
        ("GET", "/readyz"),
    }

    for key, operation in operations.items():
        if key in public_operations:
            assert "security" not in operation
        else:
            assert operation.get("security") == [{"HTTPBearer": []}]
            assert "401" in operation["responses"]


def test_tenant_scoped_operations_require_relay_user_header():
    operations = get_operations()

    tenant_operations = {
        ("POST", "/v1/incidents"),
        ("GET", "/v1/incidents"),
        ("GET", "/v1/incidents/{incident_id}"),
        ("POST", "/v1/incidents/{incident_id}/investigate"),
        ("POST", "/v1/incidents/{incident_id}/approve"),
        ("POST", "/v1/incidents/{incident_id}/execute"),
        ("POST", "/v1/incidents/{incident_id}/recover"),
        ("POST", "/v1/documents"),
        ("GET", "/v1/documents"),
        ("POST", "/v1/documents/search"),
        ("POST", "/v1/documents/answer"),
        ("GET", "/v1/documents/{document_id}"),
        ("POST", "/v1/multi-agent/tasks"),
        ("GET", "/v1/multi-agent/tasks"),
        ("GET", "/v1/multi-agent/tasks/{task_id}"),
    }

    for key in tenant_operations:
        operation = operations[key]
        headers = [
            parameter
            for parameter in operation.get("parameters", [])
            if parameter.get("name") == "X-Relay-User-Id"
            and parameter.get("in") == "header"
        ]
        assert len(headers) == 1, key
        assert headers[0]["required"] is True


def test_openapi_documents_expected_error_statuses():
    operations = get_operations()

    expected_errors = {
        ("GET", "/readyz"): {"503"},
        ("GET", "/v1/ai/status"): {"401"},
        ("POST", "/v1/incidents"): {"400", "401", "409"},
        ("GET", "/v1/incidents"): {"400", "401", "409"},
        ("GET", "/v1/incidents/{incident_id}"): {
            "400", "401", "404", "409",
        },
        ("POST", "/v1/incidents/{incident_id}/investigate"): {
            "400", "401", "404", "409", "502",
        },
        ("POST", "/v1/incidents/{incident_id}/approve"): {
            "400", "401", "404", "409",
        },
        ("POST", "/v1/incidents/{incident_id}/execute"): {
            "400", "401", "403", "404", "409", "500",
        },
        ("POST", "/v1/incidents/{incident_id}/recover"): {
            "400", "401", "404", "409",
        },
        ("POST", "/v1/conversations/analyze"): {"401", "502"},
        ("POST", "/v1/documents"): {"400", "401", "409", "502"},
        ("GET", "/v1/documents"): {"400", "401", "409"},
        ("POST", "/v1/documents/search"): {"400", "401", "409", "502"},
        ("POST", "/v1/documents/answer"): {"400", "401", "409", "502"},
        ("GET", "/v1/documents/{document_id}"): {
            "400", "401", "404", "409",
        },
        ("POST", "/v1/multi-agent/tasks"): {"400", "401", "409"},
        ("GET", "/v1/multi-agent/tasks"): {"400", "401", "409"},
        ("GET", "/v1/multi-agent/tasks/{task_id}"): {
            "400", "401", "404", "409",
        },
        ("GET", "/internal/metrics"): {"401"},
    }

    for key, expected in expected_errors.items():
        actual = set(operations[key]["responses"])
        assert expected <= actual, (
            f"{key}: missing documented errors {expected - actual}"
        )


def test_http_error_responses_reference_shared_schema():
    schema = app.openapi()
    operations = get_operations()

    for key, operation in operations.items():
        for status, response in operation["responses"].items():
            if status not in {"400", "401", "403", "404", "409", "500", "502", "503"}:
                continue

            error_schema = (
                response.get("content", {})
                .get("application/json", {})
                .get("schema", {})
            )
            assert error_schema.get("$ref") == (
                "#/components/schemas/ErrorResponse"
            ), f"{key} response {status}"

    error_model = schema["components"]["schemas"]["ErrorResponse"]
    assert error_model["properties"]["detail"]["type"] == "string"
    assert "detail" in error_model["required"]


def test_validation_responses_remain_documented():
    operations = get_operations()

    validation_operations = [
        ("POST", "/v1/incidents"),
        ("POST", "/v1/incidents/{incident_id}/execute"),
        ("POST", "/v1/conversations/analyze"),
        ("POST", "/v1/documents"),
        ("POST", "/v1/documents/search"),
        ("POST", "/v1/documents/answer"),
        ("POST", "/v1/multi-agent/tasks"),
    ]

    for key in validation_operations:
        assert "422" in operations[key]["responses"], key
