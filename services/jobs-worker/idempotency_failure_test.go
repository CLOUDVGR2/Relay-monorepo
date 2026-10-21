// Package main contains tests for idempotency failure test in the Relay jobs worker.

package main

import (
	"context"
	"errors"
	"log"
	"testing"
	"time"

	redis "github.com/redis/go-redis/v9"
)

// scriptedIdempotencyStore wraps a real Redis client and injects
// errors into selected operations.
type scriptedIdempotencyStore struct {
	*redis.Client

	existsCalls  int
	failExistsAt int
	existsErr    error
	setNXErr     error
	setErr       error
}

func (s *scriptedIdempotencyStore) Exists(
	ctx context.Context,
	keys ...string,
) *redis.IntCmd {
	s.existsCalls++

	if s.existsErr != nil && s.existsCalls == s.failExistsAt {
		cmd := redis.NewIntCmd(ctx)
		cmd.SetErr(s.existsErr)
		return cmd
	}

	return s.Client.Exists(ctx, keys...)
}

func (s *scriptedIdempotencyStore) SetNX(
	ctx context.Context,
	key string,
	value interface{},
	expiration time.Duration,
) *redis.BoolCmd {
	if s.setNXErr != nil {
		cmd := redis.NewBoolCmd(ctx)
		cmd.SetErr(s.setNXErr)
		return cmd
	}

	return s.Client.SetNX(ctx, key, value, expiration)
}

func (s *scriptedIdempotencyStore) Set(
	ctx context.Context,
	key string,
	value interface{},
	expiration time.Duration,
) *redis.StatusCmd {
	if s.setErr != nil {
		cmd := redis.NewStatusCmd(ctx)
		cmd.SetErr(s.setErr)
		return cmd
	}

	return s.Client.Set(ctx, key, value, expiration)
}

// cancelOnCompletedExistsStore simulates a completed job and cancels
// the context during the completion check.
type cancelOnCompletedExistsStore struct {
	*scriptedIdempotencyStore
	cancel context.CancelFunc
}

func (s *cancelOnCompletedExistsStore) Exists(
	ctx context.Context,
	keys ...string,
) *redis.IntCmd {
	s.cancel()

	cmd := redis.NewIntCmd(ctx)
	cmd.SetVal(1)
	return cmd
}

// cancelOnSetStore cancels the context after the completion write.
type cancelOnSetStore struct {
	*scriptedIdempotencyStore
	cancel context.CancelFunc
}

func (s *cancelOnSetStore) Set(
	ctx context.Context,
	key string,
	value interface{},
	expiration time.Duration,
) *redis.StatusCmd {
	cmd := s.scriptedIdempotencyStore.Set(
		ctx,
		key,
		value,
		expiration,
	)
	s.cancel()
	return cmd
}

func newProcessorWithScriptedStore(
	t *testing.T,
	store *scriptedIdempotencyStore,
) *JobProcessor {
	t.Helper()

	processor := newTestJobProcessor(t)

	store.Client = processor.client
	processor.store = store

	return processor
}

func validIdempotencyTestJob(id string) Job {
	return Job{
		ID:      id,
		Type:    "welcome",
		Message: "Hello!",
	}
}

func TestProcessContextCompletionCheckRedisError(t *testing.T) {
	redisErr := errors.New("Redis completion check failed")

	store := &scriptedIdempotencyStore{
		failExistsAt: 1,
		existsErr:    redisErr,
	}

	processor := newProcessorWithScriptedStore(t, store)

	processed, err := processor.ProcessContext(
		context.Background(),
		validIdempotencyTestJob("exists-error"),
	)

	if !errors.Is(err, ErrIdempotencyStore) {
		t.Fatalf("ProcessContext() error = %v, want ErrIdempotencyStore", err)
	}
	if !errors.Is(err, redisErr) {
		t.Fatalf("ProcessContext() error = %v, want wrapped Redis error", err)
	}
	if processed {
		t.Fatal("ProcessContext() reported success after Redis error")
	}
}

func TestProcessContextLockAcquisitionRedisError(t *testing.T) {
	redisErr := errors.New("Redis lock acquisition failed")

	store := &scriptedIdempotencyStore{
		setNXErr: redisErr,
	}

	processor := newProcessorWithScriptedStore(t, store)

	processed, err := processor.ProcessContext(
		context.Background(),
		validIdempotencyTestJob("lock-error"),
	)

	if !errors.Is(err, ErrIdempotencyStore) {
		t.Fatalf("ProcessContext() error = %v, want ErrIdempotencyStore", err)
	}
	if !errors.Is(err, redisErr) {
		t.Fatalf("ProcessContext() error = %v, want wrapped Redis error", err)
	}
	if processed {
		t.Fatal("ProcessContext() reported success after lock error")
	}
}

func TestProcessContextCompletionRecheckRedisError(t *testing.T) {
	redisErr := errors.New("Redis completion recheck failed")

	store := &scriptedIdempotencyStore{
		failExistsAt: 2,
		existsErr:    redisErr,
	}

	processor := newProcessorWithScriptedStore(t, store)
	job := validIdempotencyTestJob("recheck-error")

	lockKey := jobKeyPrefix + job.ID + ":lock"
	err := processor.client.Set(
		context.Background(),
		lockKey,
		"another-worker-token",
		jobLockTTL,
	).Err()
	if err != nil {
		t.Fatalf("set existing lock: %v", err)
	}

	processed, err := processor.ProcessContext(context.Background(), job)

	if !errors.Is(err, ErrIdempotencyStore) {
		t.Fatalf("ProcessContext() error = %v, want ErrIdempotencyStore", err)
	}
	if !errors.Is(err, redisErr) {
		t.Fatalf("ProcessContext() error = %v, want wrapped Redis error", err)
	}
	if processed {
		t.Fatal("ProcessContext() reported success after recheck error")
	}
	if store.existsCalls != 2 {
		t.Fatalf("Exists() calls = %d, want 2", store.existsCalls)
	}
}

func TestProcessContextRecordCompletionRedisError(t *testing.T) {
	redisErr := errors.New("Redis completion write failed")

	store := &scriptedIdempotencyStore{
		setErr: redisErr,
	}

	processor := newProcessorWithScriptedStore(t, store)
	job := validIdempotencyTestJob("completion-write-error")

	processed, err := processor.ProcessContext(context.Background(), job)

	if !errors.Is(err, ErrIdempotencyStore) {
		t.Fatalf("ProcessContext() error = %v, want ErrIdempotencyStore", err)
	}
	if !errors.Is(err, redisErr) {
		t.Fatalf("ProcessContext() error = %v, want wrapped Redis error", err)
	}
	if processed {
		t.Fatal("ProcessContext() reported success when completion write failed")
	}

	completedKey := jobKeyPrefix + job.ID + ":completed"
	exists, checkErr := processor.client.Exists(
		context.Background(),
		completedKey,
	).Result()
	if checkErr != nil {
		t.Fatalf("check completion record: %v", checkErr)
	}
	if exists != 0 {
		t.Fatal("job must not have a completion record after write failure")
	}
}

func TestProcessContextDoesNotDeleteLockOwnedByAnotherWorker(t *testing.T) {
	processor := newTestJobProcessor(t)
	job := validIdempotencyTestJob("lock-owner-change")

	lockKey := jobKeyPrefix + job.ID + ":lock"

	store := &lockReplacementStore{
		scriptedIdempotencyStore: &scriptedIdempotencyStore{
			Client: processor.client,
		},
		lockKey: lockKey,
	}
	processor.store = store

	processed, err := processor.ProcessContext(context.Background(), job)
	if err != nil {
		t.Fatalf("ProcessContext() error = %v", err)
	}
	if !processed {
		t.Fatal("ProcessContext() should process the job")
	}

	value, err := processor.client.Get(context.Background(), lockKey).Result()
	if err != nil {
		t.Fatalf("read replacement lock: %v", err)
	}
	if value != "new-owner-token" {
		t.Fatalf("lock value = %q, want %q", value, "new-owner-token")
	}
}

type lockReplacementStore struct {
	*scriptedIdempotencyStore
	lockKey  string
	replaced bool
}

func (s *lockReplacementStore) Eval(
	ctx context.Context,
	script string,
	keys []string,
	args ...interface{},
) *redis.Cmd {
	if !s.replaced && len(keys) == 1 && keys[0] == s.lockKey {
		s.replaced = true

		if err := s.Client.Set(
			ctx,
			s.lockKey,
			"new-owner-token",
			jobLockTTL,
		).Err(); err != nil {
			cmd := redis.NewCmd(ctx)
			cmd.SetErr(err)
			return cmd
		}
	}

	return s.Client.Eval(ctx, script, keys, args...)
}

func TestProcessContextRejectsEmptyJobID(t *testing.T) {
	processor := newTestJobProcessor(t)
	job := validIdempotencyTestJob("")

	processed, err := processor.ProcessContext(context.Background(), job)

	if err == nil {
		t.Fatal("expected an error for an empty job ID")
	}
	if err.Error() != "job ID is required" {
		t.Fatalf("error = %q, want %q", err.Error(), "job ID is required")
	}
	if processed {
		t.Fatal("job with an empty ID must not be processed")
	}
}

func TestProcessContextSkipsAlreadyCompletedJob(t *testing.T) {
	processor := newTestJobProcessor(t)
	job := validIdempotencyTestJob("already-completed")

	completedKey := jobKeyPrefix + job.ID + ":completed"
	err := processor.client.Set(
		context.Background(),
		completedKey,
		"1",
		jobCompletedTTL,
	).Err()
	if err != nil {
		t.Fatalf("set completion record: %v", err)
	}

	processed, err := processor.ProcessContext(context.Background(), job)
	if err != nil {
		t.Fatalf("ProcessContext() error = %v", err)
	}
	if processed {
		t.Fatal("already-completed job should not be processed again")
	}

	lockKey := jobKeyPrefix + job.ID + ":lock"
	exists, err := processor.client.Exists(context.Background(), lockKey).Result()
	if err != nil {
		t.Fatalf("check lock: %v", err)
	}
	if exists != 0 {
		t.Fatal("already-completed job should not acquire a lock")
	}
}

type cancelAfterLockStore struct {
	*scriptedIdempotencyStore
	cancel context.CancelFunc
}

func (s *cancelAfterLockStore) SetNX(
	ctx context.Context,
	key string,
	value interface{},
	expiration time.Duration,
) *redis.BoolCmd {
	cmd := s.scriptedIdempotencyStore.SetNX(ctx, key, value, expiration)

	acquired, err := cmd.Result()
	if err == nil && acquired {
		s.cancel()
	}

	return cmd
}

func TestProcessContextCancellationReleasesLock(t *testing.T) {
	processor := newTestJobProcessor(t)
	job := validIdempotencyTestJob("cancel-after-lock")
	lockKey := jobKeyPrefix + job.ID + ":lock"

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	store := &cancelAfterLockStore{
		scriptedIdempotencyStore: &scriptedIdempotencyStore{
			Client: processor.client,
		},
		cancel: cancel,
	}
	processor.store = store

	processed, err := processor.ProcessContext(ctx, job)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("ProcessContext() error = %v, want context.Canceled", err)
	}
	if processed {
		t.Fatal("canceled job must not be reported as processed")
	}

	exists, checkErr := processor.client.Exists(
		context.Background(),
		lockKey,
	).Result()
	if checkErr != nil {
		t.Fatalf("check lock: %v", checkErr)
	}
	if exists != 0 {
		t.Fatal("lock was not released after cancellation")
	}
}

type cancelOnExistsErrorStore struct {
	*scriptedIdempotencyStore
	cancel context.CancelFunc
	err    error
}

func (s *cancelOnExistsErrorStore) Exists(
	ctx context.Context,
	keys ...string,
) *redis.IntCmd {
	s.cancel()

	cmd := redis.NewIntCmd(ctx)
	cmd.SetErr(s.err)
	return cmd
}

type completeDuringLockContentionStore struct {
	*scriptedIdempotencyStore
	completedKey string
}

func (s *completeDuringLockContentionStore) SetNX(
	ctx context.Context,
	key string,
	value interface{},
	expiration time.Duration,
) *redis.BoolCmd {
	// Simulate another worker completing the job just before
	// this worker's second completion check.
	if err := s.Client.Set(
		ctx,
		s.completedKey,
		"1",
		jobCompletedTTL,
	).Err(); err != nil {
		cmd := redis.NewBoolCmd(ctx)
		cmd.SetErr(err)
		return cmd
	}

	cmd := redis.NewBoolCmd(ctx)
	cmd.SetVal(false)
	return cmd
}

func TestProcessContextLockContentionFindsCompletedJob(t *testing.T) {
	baseStore := &scriptedIdempotencyStore{}
	processor := newProcessorWithScriptedStore(t, baseStore)

	job := validIdempotencyTestJob("completed-during-contention")
	completedKey := jobKeyPrefix + job.ID + ":completed"

	store := &completeDuringLockContentionStore{
		scriptedIdempotencyStore: baseStore,
		completedKey:             completedKey,
	}
	processor.store = store

	processed, err := processor.ProcessContext(context.Background(), job)
	if err != nil {
		t.Fatalf("ProcessContext() error = %v, want nil", err)
	}
	if processed {
		t.Fatal("ProcessContext() = true, want false for completed job")
	}
	if baseStore.existsCalls != 2 {
		t.Fatalf("Exists() calls = %d, want 2", baseStore.existsCalls)
	}
}

type cancelDuringJobLogWriter struct {
	cancel context.CancelFunc
}

func (w cancelDuringJobLogWriter) Write(p []byte) (int, error) {
	w.cancel()
	return len(p), nil
}

func TestProcessContextCanceledAfterJobProcessing(t *testing.T) {
	processor := newTestJobProcessor(t)

	parentCtx, cancel := context.WithCancel(context.Background())
	defer cancel()

	previousLogOutput := log.Writer()
	log.SetOutput(cancelDuringJobLogWriter{cancel: cancel})
	defer log.SetOutput(previousLogOutput)

	processed, err := processor.ProcessContext(
		parentCtx,
		validIdempotencyTestJob("canceled-after-processing"),
	)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("ProcessContext() error = %v, want context.Canceled", err)
	}
	if processed {
		t.Fatal("ProcessContext() reported success after cancellation")
	}

	completedKey := jobKeyPrefix + "canceled-after-processing:completed"
	exists, checkErr := processor.client.Exists(
		context.Background(),
		completedKey,
	).Result()
	if checkErr != nil {
		t.Fatalf("check completion key: %v", checkErr)
	}
	if exists != 0 {
		t.Fatal("job was marked completed after cancellation")
	}
}

func TestProcessContextRandomTokenError(t *testing.T) {
	processor := newTestJobProcessor(t)

	randomErr := errors.New("random source failed")

	originalReadRandom := readRandom
	readRandom = func([]byte) (int, error) {
		return 0, randomErr
	}
	defer func() {
		readRandom = originalReadRandom
	}()

	processed, err := processor.ProcessContext(
		context.Background(),
		validIdempotencyTestJob("random-error"),
	)

	if !errors.Is(err, randomErr) {
		t.Fatalf("ProcessContext() error = %v, want wrapped random source error", err)
	}

	if processed {
		t.Fatal("ProcessContext() processed a job when random token generation failed")
	}
}
