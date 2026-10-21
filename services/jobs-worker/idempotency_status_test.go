// Package main contains tests for idempotency status test in the Relay jobs worker.

package main

import (
	"context"
	"testing"
	"time"
)

func TestUpdateJobStatusIgnoresInvalidInputs(t *testing.T) {
	processor := newTestJobProcessor(t)
	job := validIdempotencyTestJob("status-invalid-input")

	tests := []struct {
		name      string
		processor *JobProcessor
		job       Job
	}{
		{
			name:      "nil processor",
			processor: nil,
			job:       job,
		},
		{
			name:      "nil Redis client",
			processor: &JobProcessor{},
			job:       job,
		},
		{
			name:      "empty job ID",
			processor: processor,
			job:       Job{OwnerID: job.OwnerID},
		},
		{
			name:      "empty owner ID",
			processor: processor,
			job:       Job{ID: job.ID},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.processor.updateJobStatus(tt.job, "processing", 1, "")
		})
	}
}

func TestUpdateJobStatusIgnoresMissingStatusRecord(t *testing.T) {
	processor := newTestJobProcessor(t)
	job := validIdempotencyTestJob("status-missing-record")

	processor.updateJobStatus(job, "processing", 1, "")

	key := jobKeyPrefix + job.ID + ":status"
	exists, err := processor.client.Exists(context.Background(), key).Result()
	if err != nil {
		t.Fatalf("check status record: %v", err)
	}
	if exists != 0 {
		t.Fatal("status record should not be created when the owner field is missing")
	}
}

func TestUpdateJobStatusRejectsDifferentOwner(t *testing.T) {
	processor := newTestJobProcessor(t)
	job := validIdempotencyTestJob("status-owner-mismatch")
	job.OwnerID = "expected-owner"
	ctx := context.Background()
	key := jobKeyPrefix + job.ID + ":status"

	if err := processor.client.HSet(
		ctx,
		key,
		"owner_id", "different-owner",
		"status", "queued",
	).Err(); err != nil {
		t.Fatalf("seed status record: %v", err)
	}

	processor.updateJobStatus(job, "processing", 2, "should not be written")

	status, err := processor.client.HGet(ctx, key, "status").Result()
	if err != nil {
		t.Fatalf("read status: %v", err)
	}
	if status != "queued" {
		t.Fatalf("status = %q, want queued", status)
	}

	_, err = processor.client.HGet(ctx, key, "error").Result()
	if err == nil {
		t.Fatal("error field should not be written for a different owner")
	}
}

func TestUpdateJobStatusWritesStatusAndError(t *testing.T) {
	processor := newTestJobProcessor(t)
	job := validIdempotencyTestJob("status-write-error")
	job.OwnerID = "owner-status-write-error"
	ctx := context.Background()
	key := jobKeyPrefix + job.ID + ":status"

	if err := processor.client.HSet(
		ctx, key, "owner_id", job.OwnerID,
	).Err(); err != nil {
		t.Fatalf("seed status record: %v", err)
	}

	processor.updateJobStatus(job, "failed", 3, "processing failed")

	status, err := processor.client.HGet(ctx, key, "status").Result()
	if err != nil {
		t.Fatalf("read status: %v", err)
	}
	if status != "failed" {
		t.Fatalf("status = %q, want failed", status)
	}

	attempt, err := processor.client.HGet(ctx, key, "attempt").Int()
	if err != nil {
		t.Fatalf("read attempt: %v", err)
	}
	if attempt != 3 {
		t.Fatalf("attempt = %d, want 3", attempt)
	}

	message, err := processor.client.HGet(ctx, key, "error").Result()
	if err != nil {
		t.Fatalf("read error field: %v", err)
	}
	if message != "processing failed" {
		t.Fatalf("error = %q, want processing failed", message)
	}

	updatedAt, err := processor.client.HGet(ctx, key, "updated_at").Result()
	if err != nil {
		t.Fatalf("read updated_at: %v", err)
	}
	if _, err := time.Parse(time.RFC3339Nano, updatedAt); err != nil {
		t.Fatalf("updated_at %q is not a valid RFC3339Nano timestamp: %v", updatedAt, err)
	}

	ttl, err := processor.client.TTL(ctx, key).Result()
	if err != nil {
		t.Fatalf("read status TTL: %v", err)
	}
	if ttl <= 0 {
		t.Fatalf("status TTL = %v, want a positive TTL", ttl)
	}
}

func TestUpdateJobStatusClearsOldError(t *testing.T) {
	processor := newTestJobProcessor(t)
	job := validIdempotencyTestJob("status-clear-error")
	job.OwnerID = "owner-status-clear-error"
	ctx := context.Background()
	key := jobKeyPrefix + job.ID + ":status"

	if err := processor.client.HSet(
		ctx,
		key,
		"owner_id", job.OwnerID,
		"error", "previous failure",
	).Err(); err != nil {
		t.Fatalf("seed status record: %v", err)
	}

	processor.updateJobStatus(job, "completed", 4, "")

	status, err := processor.client.HGet(ctx, key, "status").Result()
	if err != nil {
		t.Fatalf("read status: %v", err)
	}
	if status != "completed" {
		t.Fatalf("status = %q, want completed", status)
	}

	_, err = processor.client.HGet(ctx, key, "error").Result()
	if err == nil {
		t.Fatal("old error field should be removed")
	}
}
