package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOpenAPIDocumentationEndpoints(t *testing.T) {
	handler := newHandlerWithStoreAndWorkerHealth(
		&fakePublisher{ready: true},
		"test-secret",
		nil,
		nil,
		false,
	)

	t.Run("Swagger UI", func(t *testing.T) {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/docs", nil))

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", rec.Code)
		}
		if !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/html") {
			t.Fatalf("unexpected content type: %q", rec.Header().Get("Content-Type"))
		}
		if !strings.Contains(rec.Body.String(), "swagger-ui") ||
			!strings.Contains(rec.Body.String(), "/openapi.json") {
			t.Fatal("Swagger UI does not reference the OpenAPI document")
		}
	})

	t.Run("OpenAPI JSON", func(t *testing.T) {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/openapi.json", nil))

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", rec.Code)
		}
		if !strings.HasPrefix(rec.Header().Get("Content-Type"), "application/json") {
			t.Fatalf("unexpected content type: %q", rec.Header().Get("Content-Type"))
		}

		var document struct {
			OpenAPI string `json:"openapi"`
			Info    struct {
				Title   string `json:"title"`
				Version string `json:"version"`
			} `json:"info"`
			Paths map[string]map[string]json.RawMessage `json:"paths"`
		}

		if err := json.Unmarshal(rec.Body.Bytes(), &document); err != nil {
			t.Fatalf("invalid OpenAPI JSON: %v", err)
		}
		if document.OpenAPI != "3.1.0" {
			t.Fatalf("OpenAPI version = %q, want 3.1.0", document.OpenAPI)
		}
		if document.Info.Title != "Relay Jobs API" {
			t.Fatalf("title = %q, want Relay Jobs API", document.Info.Title)
		}
		if document.Info.Version == "" {
			t.Fatal("OpenAPI version metadata is empty")
		}

		expected := map[string][]string{
			"/healthz":               {"get"},
			"/rabbitmqz":             {"get"},
			"/readyz":                {"get"},
			"/worker-health":         {"get"},
			"/internal/v1/jobs":      {"get", "post"},
			"/internal/v1/jobs/{id}": {"get"},
		}

		for path, methods := range expected {
			for _, method := range methods {
				if _, ok := document.Paths[path][method]; !ok {
					t.Errorf("missing documented operation: %s %s", method, path)
				}
			}
		}
	})
}

func TestOpenAPIInternalOperationsRequireBearerAuthentication(t *testing.T) {
	var document struct {
		Paths map[string]map[string]struct {
			Security []map[string][]string `json:"security"`
		} `json:"paths"`
	}

	if err := json.Unmarshal([]byte(openAPISpec), &document); err != nil {
		t.Fatalf("invalid OpenAPI JSON: %v", err)
	}

	for _, operation := range []struct {
		path   string
		method string
	}{
		{"/internal/v1/jobs", "post"},
		{"/internal/v1/jobs", "get"},
		{"/internal/v1/jobs/{id}", "get"},
	} {
		entry, ok := document.Paths[operation.path][operation.method]
		if !ok {
			t.Errorf("missing operation: %s %s", operation.method, operation.path)
			continue
		}
		if len(entry.Security) == 0 {
			t.Errorf("%s %s has no security requirement", operation.method, operation.path)
			continue
		}
		if _, ok := entry.Security[0]["internalBearerAuth"]; !ok {
			t.Errorf("%s %s does not require internalBearerAuth", operation.method, operation.path)
		}
	}
}
