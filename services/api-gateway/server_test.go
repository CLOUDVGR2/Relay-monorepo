// Package main contains tests for server test in the Relay API gateway.

package main

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testHandler() http.Handler {
	return newHandler(
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		config{
			Port:        "8090",
			ExpressURL:  "http://127.0.0.1:5001",
			NestURL:     "http://127.0.0.1:3000",
			GoAPIURL:    "http://127.0.0.1:8081",
			PythonAIURL: "http://127.0.0.1:8000",
		},
	)
}

func TestHealthEndpoints(t *testing.T) {
	rec := httptest.NewRecorder()
	testHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if rec.Header().Get("X-Request-ID") == "" {
		t.Fatal("expected request ID response header")
	}
	if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("expected security header")
	}
}

func TestReadinessRequiresBothUpstreams(t *testing.T) {
	tests := []struct {
		name        string
		expressCode int
		nestCode    int
		closeNest   bool
		wantStatus  int
	}{
		{name: "both healthy", expressCode: http.StatusOK, nestCode: http.StatusOK, wantStatus: http.StatusOK},
		{name: "express unhealthy", expressCode: http.StatusServiceUnavailable, nestCode: http.StatusOK, wantStatus: http.StatusServiceUnavailable},
		{name: "nest unhealthy", expressCode: http.StatusOK, nestCode: http.StatusServiceUnavailable, wantStatus: http.StatusServiceUnavailable},
		{name: "nest unreachable", expressCode: http.StatusOK, nestCode: http.StatusOK, closeNest: true, wantStatus: http.StatusServiceUnavailable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			express := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/api/health/ready" {
					t.Errorf("Express probe path = %q", r.URL.Path)
				}
				w.WriteHeader(tt.expressCode)
			}))
			defer express.Close()

			nest := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/health/ready" {
					t.Errorf("Nest probe path = %q", r.URL.Path)
				}
				w.WriteHeader(tt.nestCode)
			}))

			if tt.closeNest {
				nest.Close()
			} else {
				defer nest.Close()
			}

			handler := newReadinessHandler(express.URL, nest.URL)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d; body = %s", rec.Code, tt.wantStatus, rec.Body.String())
			}
			if !strings.Contains(rec.Body.String(), `"dependencies"`) {
				t.Fatalf("readiness response missing dependency details: %s", rec.Body.String())
			}
		})
	}
}

func TestRequestIDValidation(t *testing.T) {
	if !validRequestID("client-123:abc") {
		t.Fatal("expected valid request ID to pass")
	}
	for _, id := range []string{"", "bad value", "line\nbreak", string(make([]byte, 129))} {
		if validRequestID(id) {
			t.Fatalf("expected invalid request ID %q to fail", id)
		}
	}
}

func TestInvalidRequestIDIsReplaced(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("X-Request-ID", "bad value")

	testHandler().ServeHTTP(rec, req)

	if rec.Header().Get("X-Request-ID") == "bad value" || !validRequestID(rec.Header().Get("X-Request-ID")) {
		t.Fatal("invalid incoming request ID was not replaced")
	}
}

func TestUnknownRouteReturnsNotFound(t *testing.T) {
	rec := httptest.NewRecorder()
	testHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/unknown", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

func TestExpressProxyPreservesPathAndQuery(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.RequestURI(); got != "/api/messages?page=2&limit=5" {
			t.Errorf("upstream URI = %q", got)
		}
		if got := r.Header.Get("X-Forwarded-For"); got != "192.0.2.10" {
			t.Errorf("X-Forwarded-For = %q, want connection address", got)
		}
		if got := r.Header.Get("X-Forwarded-Host"); got != "gateway.example.test" {
			t.Errorf("X-Forwarded-Host = %q", got)
		}
		if got := r.Header.Get("X-Request-ID"); got != "test-request-123" {
			t.Errorf("X-Request-ID = %q", got)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("upstream-ok"))
	}))
	defer upstream.Close()

	cfg := config{
		Port: "8090", ExpressURL: upstream.URL,
		NestURL:     "http://127.0.0.1:3000",
		GoAPIURL:    "http://127.0.0.1:8081",
		PythonAIURL: "http://127.0.0.1:8000",
	}
	handler := newHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), cfg)
	req := httptest.NewRequest(http.MethodGet, "/api/messages?page=2&limit=5", nil)
	req.Host = "gateway.example.test"
	req.RemoteAddr = "192.0.2.10:4567"
	req.Header.Set("X-Forwarded-For", "203.0.113.99")
	req.Header.Set("X-Forwarded-Host", "spoofed.example")
	req.Header.Set("X-Request-ID", "test-request-123")

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if got := rec.Body.String(); got != "upstream-ok" {
		t.Fatalf("body = %q", got)
	}
}

func TestGatewaySecurityHeadersOverrideUpstream(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("X-Content-Type-Options", "unsafe")
		w.Header().Set("X-Frame-Options", "SAMEORIGIN")
		w.Header().Set("Referrer-Policy", "unsafe-url")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("upstream-ok"))
	}))
	defer upstream.Close()

	cfg := config{
		Port: "8090", ExpressURL: upstream.URL,
		NestURL:     "http://127.0.0.1:3000",
		GoAPIURL:    "http://127.0.0.1:8081",
		PythonAIURL: "http://127.0.0.1:8000",
	}
	handler := newHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), cfg)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/health/live", nil))

	for header, want := range map[string]string{
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options":        "DENY",
		"Referrer-Policy":        "no-referrer",
	} {
		if got := rec.Header().Get(header); got != want {
			t.Errorf("%s = %q, want %q", header, got, want)
		}
		if got := rec.Header().Values(header); len(got) != 1 {
			t.Errorf("%s has %d values, want exactly 1: %q", header, len(got), got)
		}
	}
}

func TestGatewaySecurityHeadersOnWire(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Add("X-Content-Type-Options", "unsafe")
		w.Header().Add("X-Frame-Options", "SAMEORIGIN")
		w.Header().Add("Referrer-Policy", "unsafe-url")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("upstream-ok"))
	}))
	defer upstream.Close()

	cfg := config{
		Port: "8090", ExpressURL: upstream.URL,
		NestURL:     "http://127.0.0.1:3000",
		GoAPIURL:    "http://127.0.0.1:8081",
		PythonAIURL: "http://127.0.0.1:8000",
	}
	gateway := httptest.NewServer(newHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), cfg))
	defer gateway.Close()

	resp, err := http.Get(gateway.URL + "/api/health/live")
	if err != nil {
		t.Fatalf("GET gateway: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusOK)
	}
	for header, want := range map[string]string{
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options":        "DENY",
		"Referrer-Policy":        "no-referrer",
	} {
		if got := resp.Header.Values(header); len(got) != 1 || got[0] != want {
			t.Errorf("%s = %q, want exactly [%q]", header, got, want)
		}
	}
}

func TestCallsProxyForwardsRecordingUploadAndAuthorization(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %q, want POST", r.Method)
		}
		if got, want := r.URL.RequestURI(), "/calls/recording-uploads/upload-123/complete?source=mobile"; got != want {
			t.Errorf("upstream URI = %q, want %q", got, want)
		}
		if got, want := r.Header.Get("Authorization"), "Bearer mobile-test-token"; got != want {
			t.Errorf("Authorization = %q, want %q", got, want)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("nest-ok"))
	}))
	defer upstream.Close()

	cfg := config{
		Port: "8090", ExpressURL: "http://127.0.0.1:5001",
		NestURL:     upstream.URL,
		GoAPIURL:    "http://127.0.0.1:8081",
		PythonAIURL: "http://127.0.0.1:8000",
	}
	handler := newHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), cfg)

	req := httptest.NewRequest(
		http.MethodPost,
		"/calls/recording-uploads/upload-123/complete?source=mobile",
		strings.NewReader("{}"),
	)
	req.Header.Set("Authorization", "Bearer mobile-test-token")
	req.Header.Set("Content-Type", "application/json")

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if got := rec.Body.String(); got != "nest-ok" {
		t.Fatalf("body = %q, want %q", got, "nest-ok")
	}
}

func TestUnavailableUpstreamReturnsJSON502(t *testing.T) {
	cfg := config{
		Port: "8090", ExpressURL: "http://127.0.0.1:1",
		NestURL:     "http://127.0.0.1:3000",
		GoAPIURL:    "http://127.0.0.1:8081",
		PythonAIURL: "http://127.0.0.1:8000",
	}
	handler := newHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), cfg)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/messages", nil))

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadGateway)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q", got)
	}
	if !strings.Contains(rec.Body.String(), `"error":"upstream_unavailable"`) {
		t.Fatalf("unexpected error body: %q", rec.Body.String())
	}
}

func TestGatewayOpenAPISpecEndpoint(t *testing.T) {
	rec := httptest.NewRecorder()
	testHandler().ServeHTTP(
		rec,
		httptest.NewRequest(http.MethodGet, "/gateway/openapi.json", nil),
	)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, "application/json") {
		t.Fatalf("Content-Type = %q, want application/json", got)
	}

	body := rec.Body.String()
	for _, expected := range []string{
		`"openapi": "3.1.0"`,
		`"title": "Relay API Gateway"`,
		`"/healthz"`,
		`"/readyz"`,
		`"HealthStatus"`,
		`"X-Request-ID"`,
	} {
		if !strings.Contains(body, expected) {
			t.Errorf("OpenAPI document does not contain %q", expected)
		}
	}
}

func TestGatewaySwaggerUIEndpoint(t *testing.T) {
	rec := httptest.NewRecorder()
	testHandler().ServeHTTP(
		rec,
		httptest.NewRequest(http.MethodGet, "/gateway/docs", nil),
	)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, "text/html") {
		t.Fatalf("Content-Type = %q, want text/html", got)
	}

	body := rec.Body.String()
	for _, expected := range []string{
		"Relay API Gateway",
		"swagger-ui",
		"/gateway/openapi.json",
	} {
		if !strings.Contains(body, expected) {
			t.Errorf("Swagger UI page does not contain %q", expected)
		}
	}
}
