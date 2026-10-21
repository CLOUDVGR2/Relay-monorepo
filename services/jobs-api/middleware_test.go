// Package main contains tests for middleware test in the Relay jobs API.

package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRequestIDMiddleware(t *testing.T) {
	tests := []struct {
		name       string
		incomingID string
		preserveID bool
	}{
		{
			name:       "preserves valid request ID",
			incomingID: "relay-api_01.abc-123",
			preserveID: true,
		},
		{
			name:       "replaces invalid request ID",
			incomingID: "invalid request id!",
		},
		{
			name: "generates ID when header is missing",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			router := gin.New()
			router.Use(requestIDMiddleware())

			router.GET("/test", func(c *gin.Context) {
				c.String(
					http.StatusOK,
					requestIDFromContext(c.Request.Context()),
				)
			})

			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			if tt.incomingID != "" {
				req.Header.Set(requestIDHeader, tt.incomingID)
			}

			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200", rec.Code)
			}

			responseID := rec.Header().Get(requestIDHeader)
			if responseID == "" {
				t.Fatal("response is missing request ID header")
			}

			if !validRequestID(responseID) {
				t.Fatalf("generated or returned invalid request ID %q", responseID)
			}

			if tt.preserveID && responseID != tt.incomingID {
				t.Fatalf("request ID = %q, want %q", responseID, tt.incomingID)
			}

			if !tt.preserveID && responseID == tt.incomingID {
				t.Fatalf("invalid request ID was preserved: %q", responseID)
			}

			if !tt.preserveID && len(responseID) != 32 {
				t.Fatalf("generated request ID length = %d, want 32", len(responseID))
			}

			if rec.Body.String() != responseID {
				t.Fatalf(
					"context request ID = %q, response header = %q",
					rec.Body.String(),
					responseID,
				)
			}
		})
	}
}
