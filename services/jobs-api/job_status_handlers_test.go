// Package main contains tests for job status handlers test in the Relay jobs API.

package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type fakeJobStatusStore struct {
	jobs      []JobStatus
	job       JobStatus
	listErr   error
	getErr    error
	listOwner string
	listLimit int
	getOwner  string
	getID     string
}

func (f *fakeJobStatusStore) Create(context.Context, Job, string) error {
	return nil
}

func (f *fakeJobStatusStore) Update(context.Context, string, string, string, int, string) error {
	return nil
}

func (f *fakeJobStatusStore) List(_ context.Context, ownerID string, limit int) ([]JobStatus, error) {
	f.listOwner = ownerID
	f.listLimit = limit
	if f.listErr != nil {
		return nil, f.listErr
	}
	return f.jobs, nil
}

func (f *fakeJobStatusStore) Get(_ context.Context, ownerID, id string) (JobStatus, error) {
	f.getOwner = ownerID
	f.getID = id
	if f.getErr != nil {
		return JobStatus{}, f.getErr
	}
	return f.job, nil
}

func authenticatedRequest(method, target string) *http.Request {
	req := httptest.NewRequest(method, target, nil)
	req.Header.Set("Authorization", "Bearer test-secret")
	return req
}

func TestJobHistoryRequiresAuthentication(t *testing.T) {
	store := &fakeJobStatusStore{}
	handler := newHandlerWithStore(&fakePublisher{ready: true}, "test-secret", store)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(
		http.MethodGet,
		"/internal/v1/jobs?ownerId=user-1",
		nil,
	))

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if store.listOwner != "" {
		t.Fatal("unauthenticated request reached the status store")
	}
}

func TestJobHistoryReturnsJobsAndUsesRequestedLimit(t *testing.T) {
	now := time.Now().UTC()
	store := &fakeJobStatusStore{
		jobs: []JobStatus{{
			ID:        "job-1",
			Type:      "welcome",
			Status:    "completed",
			Attempt:   1,
			CreatedAt: now,
			UpdatedAt: now,
		}},
	}
	handler := newHandlerWithStore(&fakePublisher{ready: true}, "test-secret", store)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, authenticatedRequest(
		http.MethodGet,
		"/internal/v1/jobs?ownerId=user-1&limit=10",
	))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if store.listOwner != "user-1" || store.listLimit != 10 {
		t.Fatalf("store called with owner=%q limit=%d", store.listOwner, store.listLimit)
	}
	if !strings.Contains(rec.Body.String(), `"jobs"`) ||
		!strings.Contains(rec.Body.String(), `"job-1"`) {
		t.Fatalf("unexpected history response: %s", rec.Body.String())
	}
}

func TestJobHistoryRejectsInvalidOwnerAndLimit(t *testing.T) {
	tests := []struct {
		name string
		path string
	}{
		{"missing owner", "/internal/v1/jobs"},
		{"invalid limit", "/internal/v1/jobs?ownerId=user-1&limit=abc"},
		{"zero limit", "/internal/v1/jobs?ownerId=user-1&limit=0"},
		{"limit too high", "/internal/v1/jobs?ownerId=user-1&limit=101"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := &fakeJobStatusStore{}
			handler := newHandlerWithStore(&fakePublisher{ready: true}, "test-secret", store)

			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, authenticatedRequest(http.MethodGet, tt.path))

			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body = %s", rec.Code, rec.Body.String())
			}
			if store.listOwner != "" {
				t.Fatal("invalid request reached the status store")
			}
		})
	}
}

func TestJobHistoryStoreFailureReturnsUnavailable(t *testing.T) {
	store := &fakeJobStatusStore{listErr: errors.New("private Redis error")}
	handler := newHandlerWithStore(&fakePublisher{ready: true}, "test-secret", store)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, authenticatedRequest(
		http.MethodGet,
		"/internal/v1/jobs?ownerId=user-1",
	))

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "private Redis error") {
		t.Fatal("internal store error leaked in response")
	}
}

func TestJobDetailRequiresAuthentication(t *testing.T) {
	store := &fakeJobStatusStore{}
	handler := newHandlerWithStore(&fakePublisher{ready: true}, "test-secret", store)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(
		http.MethodGet,
		"/internal/v1/jobs/job-1?ownerId=user-1",
		nil,
	))

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if store.getID != "" {
		t.Fatal("unauthenticated request reached the status store")
	}
}

func TestJobDetailPassesOwnerAndIDToStore(t *testing.T) {
	now := time.Now().UTC()
	store := &fakeJobStatusStore{
		job: JobStatus{
			ID:        "job-1",
			Type:      "welcome",
			Status:    "completed",
			Attempt:   1,
			CreatedAt: now,
			UpdatedAt: now,
		},
	}
	handler := newHandlerWithStore(&fakePublisher{ready: true}, "test-secret", store)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, authenticatedRequest(
		http.MethodGet,
		"/internal/v1/jobs/job-1?ownerId=user-1",
	))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if store.getOwner != "user-1" || store.getID != "job-1" {
		t.Fatalf("store called with owner=%q id=%q", store.getOwner, store.getID)
	}
	if !strings.Contains(rec.Body.String(), `"id":"job-1"`) {
		t.Fatalf("unexpected detail response: %s", rec.Body.String())
	}
}

func TestJobDetailHidesJobsNotOwnedByRequester(t *testing.T) {
	store := &fakeJobStatusStore{getErr: ErrJobStatusNotFound}
	handler := newHandlerWithStore(&fakePublisher{ready: true}, "test-secret", store)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, authenticatedRequest(
		http.MethodGet,
		"/internal/v1/jobs/private-job?ownerId=another-user",
	))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	if store.getOwner != "another-user" {
		t.Fatalf("store owner = %q, want another-user", store.getOwner)
	}
	if strings.Contains(rec.Body.String(), "private-job") {
		t.Fatal("response exposed the requested job ID")
	}
}

func TestJobDetailRequiresOwnerID(t *testing.T) {
	store := &fakeJobStatusStore{}
	handler := newHandlerWithStore(&fakePublisher{ready: true}, "test-secret", store)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, authenticatedRequest(
		http.MethodGet,
		"/internal/v1/jobs/job-1",
	))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if store.getID != "" {
		t.Fatal("request without owner ID reached the status store")
	}
}

func TestJobDetailStoreFailureReturnsUnavailable(t *testing.T) {
	store := &fakeJobStatusStore{getErr: errors.New("private Redis error")}
	handler := newHandlerWithStore(&fakePublisher{ready: true}, "test-secret", store)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, authenticatedRequest(
		http.MethodGet,
		"/internal/v1/jobs/job-1?ownerId=user-1",
	))

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "private Redis error") {
		t.Fatal("internal store error leaked in response")
	}
}
