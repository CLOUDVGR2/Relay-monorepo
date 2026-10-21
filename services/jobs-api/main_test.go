// Package main contains tests for main test in the Relay jobs API.

package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakePublisher struct {
	ready bool
	err   error
	job   Job
	calls int
}

func (f *fakePublisher) Publish(_ context.Context, job Job) error {
	f.calls++
	f.job = job
	return f.err
}

func (f *fakePublisher) Ready() bool {
	return f.ready
}

func (f *fakePublisher) Close() error {
	return nil
}

func TestHealthEndpoint(t *testing.T) {
	handler := newHandler(&fakePublisher{ready: true}, "test-secret")
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var body healthResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Status != "ok" || body.Service != "go-api" {
		t.Fatalf("unexpected response: %+v", body)
	}
}

func TestReadinessRequiresPublisher(t *testing.T) {
	handler := newHandler(&fakePublisher{ready: false}, "test-secret")
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}

func TestReadinessWhenPublisherIsReady(t *testing.T) {
	handler := newHandler(&fakePublisher{ready: true}, "test-secret")
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}

func TestSubmitJobRequiresAuthentication(t *testing.T) {
	publisher := &fakePublisher{ready: true}
	handler := newHandler(publisher, "test-secret")

	req := httptest.NewRequest(
		http.MethodPost,
		"/internal/v1/jobs",
		strings.NewReader(`{"type":"welcome","message":"Hello"}`),
	)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if publisher.calls != 0 {
		t.Fatal("unauthenticated request published a job")
	}
}

func TestSubmitJobRejectsInvalidBearerToken(t *testing.T) {
	publisher := &fakePublisher{ready: true}
	handler := newHandler(publisher, "test-secret")

	req := httptest.NewRequest(
		http.MethodPost,
		"/internal/v1/jobs",
		strings.NewReader(`{"type":"welcome","message":"Hello"}`),
	)
	req.Header.Set("Authorization", "Bearer wrong-secret")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if publisher.calls != 0 {
		t.Fatal("request with an invalid token published a job")
	}
}

func TestSubmitJobRejectsMalformedAuthorizationHeaders(t *testing.T) {
	cases := []struct {
		name   string
		header string
	}{
		{name: "basic scheme", header: "Basic test-secret"},
		{name: "missing bearer token", header: "Bearer "},
		{name: "wrong scheme casing with malformed value", header: "Basic"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			publisher := &fakePublisher{ready: true}
			handler := newHandler(publisher, "test-secret")

			req := httptest.NewRequest(
				http.MethodPost,
				"/internal/v1/jobs",
				strings.NewReader(`{"type":"welcome","message":"Hello"}`),
			)
			req.Header.Set("Authorization", tc.header)
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want 401", rec.Code)
			}
			if publisher.calls != 0 {
				t.Fatal("request with malformed authorization header published a job")
			}
		})
	}
}

func TestSubmitJobQueuesValidRequest(t *testing.T) {
	publisher := &fakePublisher{ready: true}
	handler := newHandler(publisher, "test-secret")

	req := httptest.NewRequest(
		http.MethodPost,
		"/internal/v1/jobs",
		strings.NewReader(`{"type":"welcome","message":"Hello team"}`),
	)
	req.Header.Set("Authorization", "Bearer test-secret")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if publisher.calls != 1 {
		t.Fatalf("publish calls = %d, want 1", publisher.calls)
	}
	if publisher.job.ID == "" ||
		publisher.job.Type != "welcome" ||
		publisher.job.Message != "Hello team" {
		t.Fatalf("unexpected published job: %+v", publisher.job)
	}

	var body submitJobResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.ID != publisher.job.ID || body.Status != "queued" {
		t.Fatalf("unexpected response: %+v", body)
	}
}

func TestSubmitJobPreservesSuppliedID(t *testing.T) {
	publisher := &fakePublisher{ready: true}
	handler := newHandler(publisher, "test-secret")

	req := httptest.NewRequest(
		http.MethodPost,
		"/internal/v1/jobs",
		strings.NewReader(`{"id":"job-123","type":"welcome","message":"Hello"}`),
	)
	req.Header.Set("Authorization", "Bearer test-secret")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if publisher.job.ID != "job-123" {
		t.Fatalf("job ID = %q, want job-123", publisher.job.ID)
	}
}

func TestSubmitJobRejectsInvalidRequests(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"invalid JSON", `{`},
		{"unsupported type", `{"type":"email","message":"Hello"}`},
		{"missing message", `{"type":"welcome","message":"  "}`},
		{"unknown field", `{"type":"welcome","message":"Hello","extra":true}`},
		{"multiple JSON objects", `{"type":"welcome","message":"Hello"} {}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			publisher := &fakePublisher{ready: true}
			handler := newHandler(publisher, "test-secret")

			req := httptest.NewRequest(
				http.MethodPost,
				"/internal/v1/jobs",
				strings.NewReader(tt.body),
			)
			req.Header.Set("Authorization", "Bearer test-secret")
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body = %s", rec.Code, rec.Body.String())
			}
			if publisher.calls != 0 {
				t.Fatal("invalid request published a job")
			}
		})
	}
}

func TestSubmitJobReturnsUnavailableWhenPublishingFails(t *testing.T) {
	publisher := &fakePublisher{
		ready: true,
		err:   errors.New("simulated broker failure"),
	}
	handler := newHandler(publisher, "test-secret")

	req := httptest.NewRequest(
		http.MethodPost,
		"/internal/v1/jobs",
		strings.NewReader(`{"type":"welcome","message":"Hello"}`),
	)
	req.Header.Set("Authorization", "Bearer test-secret")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}

func TestSubmitJobFailsClosedWithoutConfiguredToken(t *testing.T) {
	publisher := &fakePublisher{ready: true}
	handler := newHandler(publisher, "")

	req := httptest.NewRequest(
		http.MethodPost,
		"/internal/v1/jobs",
		strings.NewReader(`{"type":"welcome","message":"Hello"}`),
	)
	req.Header.Set("Authorization", "Bearer anything")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	if publisher.calls != 0 {
		t.Fatal("request published without configured authentication")
	}
}
