// Package main contains tests for job test in the Relay jobs worker.

package main

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	redis "github.com/redis/go-redis/v9"
)

func newTestJobProcessor(t *testing.T) *JobProcessor {
	t.Helper()

	server, err := miniredis.Run()
	if err != nil {
		t.Fatalf("start test Redis: %v", err)
	}
	t.Cleanup(server.Close)

	client := redis.NewClient(&redis.Options{
		Addr: server.Addr(),
	})
	t.Cleanup(func() {
		if err := client.Close(); err != nil {
			t.Errorf("close test Redis client: %v", err)
		}
	})

	return NewJobProcessor(client)
}

func TestProcessJob(t *testing.T) {
	tests := []struct {
		name    string
		job     Job
		wantErr bool
	}{
		{
			name: "valid welcome job",
			job: Job{
				ID:      "test-001",
				Type:    "welcome",
				Message: "Hello from Node.js to Go!",
			},
		},
		{
			name: "missing job ID",
			job: Job{
				Type:    "welcome",
				Message: "Hello!",
			},
			wantErr: true,
		},
		{
			name: "missing welcome message",
			job: Job{
				ID:   "test-002",
				Type: "welcome",
			},
			wantErr: true,
		},
		{
			name: "unsupported job type",
			job: Job{
				ID:   "test-003",
				Type: "unknown",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := processJob(tt.job)
			if (err != nil) != tt.wantErr {
				t.Fatalf(
					"processJob() error = %v, wantErr %v",
					err,
					tt.wantErr,
				)
			}
		})
	}
}

func TestJobProcessorSkipsDuplicate(t *testing.T) {
	processor := newTestJobProcessor(t)

	job := Job{
		ID:      "duplicate-001",
		Type:    "welcome",
		Message: "Hello!",
	}

	first, err := processor.Process(job)
	if err != nil {
		t.Fatalf("first Process() error = %v", err)
	}
	if !first {
		t.Fatal("first Process() should process the job")
	}

	second, err := processor.Process(job)
	if err != nil {
		t.Fatalf("second Process() error = %v", err)
	}
	if second {
		t.Fatal("second Process() should skip the duplicate")
	}
}

func TestJobProcessorRetriesAfterFailure(t *testing.T) {
	processor := newTestJobProcessor(t)

	job := Job{
		ID:      "retry-001",
		Type:    "unsupported",
		Message: "Hello!",
	}

	processed, err := processor.Process(job)
	if err == nil {
		t.Fatal("first Process() should fail for unsupported job type")
	}
	if processed {
		t.Fatal("failed job should not be marked as processed")
	}

	// A failed attempt must release its lock and must not
	// leave a completion record that would block a retry.
	ctx := context.Background()
	lockKey := jobKeyPrefix + job.ID + ":lock"
	completedKey := jobKeyPrefix + job.ID + ":completed"

	locked, err := processor.client.Exists(ctx, lockKey).Result()
	if err != nil {
		t.Fatalf("check lock after failure: %v", err)
	}
	if locked != 0 {
		t.Fatal("failed job must not leave a Redis lock")
	}

	completed, err := processor.client.Exists(ctx, completedKey).Result()
	if err != nil {
		t.Fatalf("check completion after failure: %v", err)
	}
	if completed != 0 {
		t.Fatal("failed job must not have a completion record")
	}

	// Retry with the same ID and a valid job.
	job.Type = "welcome"

	processed, err = processor.Process(job)
	if err != nil {
		t.Fatalf("retry Process() error = %v", err)
	}
	if !processed {
		t.Fatal("retry should process the job successfully")
	}

	// A successful job with the same ID should now be skipped.
	processed, err = processor.Process(job)
	if err != nil {
		t.Fatalf("duplicate Process() error = %v", err)
	}
	if processed {
		t.Fatal("successful job should not be processed twice")
	}
}

// TestProcessContextReturnsCanceled verifies that a canceled context
// prevents job processing from starting and leaves no Redis state.
func TestProcessContextReturnsCanceled(t *testing.T) {
	processor := newTestJobProcessor(t)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	job := Job{
		ID:      "canceled-001",
		Type:    "welcome",
		Message: "Hello!",
	}

	processed, err := processor.ProcessContext(ctx, job)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf(
			"ProcessContext() error = %v, want %v",
			err,
			context.Canceled,
		)
	}

	if processed {
		t.Fatal("ProcessContext() processed a job with a canceled context")
	}

	// A canceled job must not have a completion record.
	completedKey := jobKeyPrefix + job.ID + ":completed"
	completed, err := processor.client.Exists(
		context.Background(),
		completedKey,
	).Result()
	if err != nil {
		t.Fatalf("check completion key: %v", err)
	}
	if completed != 0 {
		t.Fatal("canceled job must not have a completion record")
	}

	// A context canceled before processing should not acquire a lock.
	lockKey := jobKeyPrefix + job.ID + ":lock"
	locked, err := processor.client.Exists(
		context.Background(),
		lockKey,
	).Result()
	if err != nil {
		t.Fatalf("check lock key: %v", err)
	}
	if locked != 0 {
		t.Fatal("canceled job must not leave a lock")
	}
}

func TestProcessJobContextReturnsCanceled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	job := Job{
		ID:      "cancelled-job",
		Type:    "welcome",
		Message: "Hello!",
	}

	err := processJobContext(ctx, job)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("processJobContext() error = %v, want %v", err, context.Canceled)
	}
}

func TestJobProcessorReturnsJobInProgressWithExistingLock(t *testing.T) {
	processor := newTestJobProcessor(t)

	job := Job{
		ID:      "in-progress-001",
		Type:    "welcome",
		Message: "Hello!",
	}

	lockKey := jobKeyPrefix + job.ID + ":lock"

	// Simulate another worker holding the job lock.
	err := processor.client.Set(
		context.Background(),
		lockKey,
		"another-worker-token",
		jobLockTTL,
	).Err()
	if err != nil {
		t.Fatalf("set existing lock: %v", err)
	}

	processed, err := processor.Process(job)

	if !errors.Is(err, ErrJobInProgress) {
		t.Fatalf("Process() error = %v, want %v", err, ErrJobInProgress)
	}

	if processed {
		t.Fatal("Process() processed a job whose lock is held")
	}
}

func TestJobProcessorConcurrentDuplicate(t *testing.T) {
	processor := newTestJobProcessor(t)

	job := Job{
		ID:      "concurrent-001",
		Type:    "welcome",
		Message: "Hello!",
	}

	const workers = 2

	start := make(chan struct{})

	type result struct {
		processed bool
		err       error
	}

	results := make(chan result, workers)

	for i := 0; i < workers; i++ {
		go func() {
			<-start

			processed, err := processor.Process(job)
			results <- result{
				processed: processed,
				err:       err,
			}
		}()
	}

	// Allow both goroutines to start together.
	close(start)

	successes := 0
	skipped := 0

	for i := 0; i < workers; i++ {
		got := <-results

		if got.err != nil && !errors.Is(got.err, ErrJobInProgress) {
			t.Fatalf("Process() returned unexpected error: %v", got.err)
		}

		if got.processed {
			if got.err != nil {
				t.Fatalf("processed job returned an error: %v", got.err)
			}

			successes++
			continue
		}

		// A duplicate may be skipped, or the lock may
		// still be held by the other goroutine.
		if got.err == nil || errors.Is(got.err, ErrJobInProgress) {
			skipped++
		}
	}

	if successes != 1 {
		t.Fatalf("successful processing calls = %d, want 1", successes)
	}

	if skipped != 1 {
		t.Fatalf("skipped or blocked calls = %d, want 1", skipped)
	}
}

func TestJobProcessorReturnsErrorWhenRedisClientIsNil(t *testing.T) {
	processor := NewJobProcessor(nil)

	job := Job{
		ID:      "nil-redis-001",
		Type:    "welcome",
		Message: "Hello!",
	}

	processed, err := processor.Process(job)

	if !errors.Is(err, ErrIdempotencyStore) {
		t.Fatalf(
			"Process() error = %v, want %v",
			err,
			ErrIdempotencyStore,
		)
	}

	if processed {
		t.Fatal("Process() should not process a job without Redis")
	}
}
func TestJobProcessorReturnsErrorWhenRedisIsUnavailable(t *testing.T) {
	client := redis.NewClient(&redis.Options{
		Addr:       "127.0.0.1:1",
		MaxRetries: -1,
	})
	t.Cleanup(func() {
		if err := client.Close(); err != nil {
			t.Errorf("close Redis client: %v", err)
		}
	})

	processor := NewJobProcessor(client)

	job := Job{
		ID:      "redis-unavailable-001",
		Type:    "welcome",
		Message: "Hello!",
	}

	processed, err := processor.Process(job)

	if !errors.Is(err, ErrIdempotencyStore) {
		t.Fatalf("Process() error = %v, want an error wrapping %v",
			err, ErrIdempotencyStore)
	}

	if processed {
		t.Fatal("Process() should not process a job when Redis is unavailable")
	}
}

// completionFailureStore simulates a Redis failure when recording completion.
type completionFailureStore struct {
	*redis.Client
	err error
}

func (s *completionFailureStore) Set(
	ctx context.Context,
	key string,
	value interface{},
	expiration time.Duration,
) *redis.StatusCmd {
	if len(key) >= len(":completed") &&
		key[len(key)-len(":completed"):] == ":completed" {
		cmd := redis.NewStatusCmd(ctx)
		cmd.SetErr(s.err)
		return cmd
	}

	return s.Client.Set(ctx, key, value, expiration)
}

func TestJobProcessorReturnsErrorWhenCompletionRecordFails(t *testing.T) {
	processor := newTestJobProcessor(t)
	wantErr := errors.New("simulated completion write failure")
	processor.store = &completionFailureStore{
		Client: processor.client,
		err:    wantErr,
	}

	job := Job{
		ID:      "completion-failure-001",
		Type:    "welcome",
		Message: "Test completion recording failure",
	}

	processed, err := processor.Process(job)

	if processed {
		t.Fatal("Process() reported success despite completion recording failure")
	}
	if !errors.Is(err, ErrIdempotencyStore) {
		t.Fatalf("Process() error = %v, want an error wrapping %v",
			err, ErrIdempotencyStore)
	}
	if !errors.Is(err, wantErr) {
		t.Fatalf("Process() error = %v, want it to wrap %v",
			err, wantErr)
	}

	ctx := context.Background()
	lockKey := jobKeyPrefix + job.ID + ":lock"
	completedKey := jobKeyPrefix + job.ID + ":completed"

	lockExists, checkErr := processor.client.Exists(ctx, lockKey).Result()
	if checkErr != nil {
		t.Fatalf("check job lock: %v", checkErr)
	}
	if lockExists != 0 {
		t.Fatal("job lock should be released after completion recording fails")
	}

	completedExists, checkErr := processor.client.Exists(ctx, completedKey).Result()
	if checkErr != nil {
		t.Fatalf("check completion record: %v", checkErr)
	}
	if completedExists != 0 {
		t.Fatal("completion record should not exist after the simulated failure")
	}
}

func TestJobProcessorCanRetryAfterCompletionRecordFailure(t *testing.T) {
	processor := newTestJobProcessor(t)

	processor.store = &completionFailureStore{
		Client: processor.client,
		err:    errors.New("simulated completion write failure"),
	}

	job := Job{
		ID:      "completion-retry-001",
		Type:    "welcome",
		Message: "Retry after Redis recovers",
	}

	processed, err := processor.Process(job)
	if processed {
		t.Fatal("Process() reported success despite completion recording failure")
	}
	if !errors.Is(err, ErrIdempotencyStore) {
		t.Fatalf("Process() error = %v, want ErrIdempotencyStore", err)
	}

	// Simulate recovery by restoring the normal Redis store.
	processor.store = processor.client

	processed, err = processor.Process(job)
	if err != nil {
		t.Fatalf("Process() retry returned unexpected error: %v", err)
	}
	if !processed {
		t.Fatal("Process() retry reported the job was not processed")
	}

	ctx := context.Background()
	completedKey := jobKeyPrefix + job.ID + ":completed"

	completed, err := processor.client.Exists(ctx, completedKey).Result()
	if err != nil {
		t.Fatalf("check completion record: %v", err)
	}
	if completed != 1 {
		t.Fatal("expected completion record after successful retry")
	}
}

func TestProcessJobContextCanceledDuringProcessing(t *testing.T) {
	ctx := &cancelOnSecondErrContext{
		Context: context.Background(),
	}

	job := Job{
		ID:      "cancel-during-processing",
		Type:    "welcome",
		Message: "Hello!",
	}

	err := processJobContext(ctx, job)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf(
			"processJobContext() error = %v, want %v",
			err,
			context.Canceled,
		)
	}

	if ctx.errCalls != 2 {
		t.Fatalf(
			"context Err() called %d times, want 2",
			ctx.errCalls,
		)
	}
}
