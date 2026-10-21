// Package main contains idempotency logic for the Relay jobs worker.

package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"time"

	redis "github.com/redis/go-redis/v9"
)

const (
	jobKeyPrefix    = "go-worker:job:"
	jobLockTTL      = time.Minute
	jobCompletedTTL = 30 * 24 * time.Hour
	redisOpTimeout  = 5 * time.Second
)

var (
	ErrIdempotencyStore = errors.New("idempotency store error")
	ErrJobInProgress    = errors.New("job is already being processed")

	// readRandom allows tests to simulate random-token generation failures.
	readRandom = rand.Read
)

// idempotencyStore defines the Redis operations used by JobProcessor.
type idempotencyStore interface {
	Exists(ctx context.Context, keys ...string) *redis.IntCmd
	SetNX(ctx context.Context, key string, value interface{}, expiration time.Duration) *redis.BoolCmd
	Eval(ctx context.Context, script string, keys []string, args ...interface{}) *redis.Cmd
	Set(ctx context.Context, key string, value interface{}, expiration time.Duration) *redis.StatusCmd
}

// JobProcessor tracks completed jobs in Redis.
type jobStatusClient interface {
	HGet(ctx context.Context, key, field string) *redis.StringCmd
	HSet(ctx context.Context, key string, values ...interface{}) *redis.IntCmd
	HDel(ctx context.Context, key string, fields ...string) *redis.IntCmd
	Expire(ctx context.Context, key string, expiration time.Duration) *redis.BoolCmd
}

type JobProcessor struct {
	client       *redis.Client
	statusClient jobStatusClient
	store        idempotencyStore
}

// NewJobProcessor creates a processor backed by Redis.
func NewJobProcessor(client *redis.Client) *JobProcessor {
	return &JobProcessor{
		client:       client,
		store:        client,
		statusClient: client,
	}
}

// Process preserves compatibility with existing callers.
func (p *JobProcessor) Process(job Job) (bool, error) {
	return p.ProcessContext(context.Background(), job)
}

// ProcessContext processes a job unless Redis already records it as completed.
// The boolean is true only when this call successfully processes the job.
// Redis operations use the earlier of the parent deadline and redisOpTimeout.
func (p *JobProcessor) ProcessContext(
	parentCtx context.Context,
	job Job,
) (bool, error) {
	ctx, cancel := context.WithTimeout(parentCtx, redisOpTimeout)
	defer cancel()

	// Fail fast if the caller has already canceled the operation.
	if err := ctx.Err(); err != nil {
		return false, err
	}

	if p == nil || p.client == nil || p.store == nil {
		return false, fmt.Errorf(
			"%w: Redis client is nil",
			ErrIdempotencyStore,
		)
	}

	if job.ID == "" {
		return false, fmt.Errorf("job ID is required")
	}

	completedKey := jobKeyPrefix + job.ID + ":completed"
	lockKey := jobKeyPrefix + job.ID + ":lock"

	completed, err := p.store.Exists(ctx, completedKey).Result()
	if err != nil {
		return false, fmt.Errorf(
			"%w: check completion: %w",
			ErrIdempotencyStore,
			err,
		)
	}

	if completed > 0 {
		return false, nil
	}

	tokenBytes := make([]byte, 16)
	if _, err := readRandom(tokenBytes); err != nil {
		return false, fmt.Errorf("create lock token: %w", err)
	}
	token := hex.EncodeToString(tokenBytes)

	acquired, err := p.store.SetNX(
		ctx,
		lockKey,
		token,
		jobLockTTL,
	).Result()
	if err != nil {
		return false, fmt.Errorf(
			"%w: acquire job lock: %w",
			ErrIdempotencyStore,
			err,
		)
	}

	if !acquired {
		// Another worker may have completed the job while we waited.
		completed, err = p.store.Exists(ctx, completedKey).Result()
		if err != nil {
			return false, fmt.Errorf(
				"%w: recheck completion: %w",
				ErrIdempotencyStore,
				err,
			)
		}

		if completed > 0 {
			return false, nil
		}

		return false, ErrJobInProgress
	}

	// Release the lock only if it still belongs to this invocation.
	// Use a separate context so cancellation of the job does not prevent cleanup.
	defer func() {
		releaseCtx, releaseCancel := context.WithTimeout(
			context.Background(),
			redisOpTimeout,
		)
		defer releaseCancel()

		_ = p.store.Eval(
			releaseCtx,
			`if redis.call("GET", KEYS[1]) == ARGV[1] then
				return redis.call("DEL", KEYS[1])
			end
			return 0`,
			[]string{lockKey},
			token,
		).Err()
	}()

	if err := ctx.Err(); err != nil {
		return false, err
	}

	if err := processJobContext(ctx, job); err != nil {
		return false, err
	}

	if err := ctx.Err(); err != nil {
		return false, err
	}

	if err := p.store.Set(
		ctx,
		completedKey,
		"1",
		jobCompletedTTL,
	).Err(); err != nil {
		return false, fmt.Errorf(
			"%w: record completion: %w",
			ErrIdempotencyStore,
			err,
		)
	}

	return true, nil
}

// updateJobStatus updates the API-created Redis status record on a best-effort
// basis. A missing or mismatched owner is never allowed to update that record.
func (p *JobProcessor) updateJobStatus(job Job, status string, attempt int, errorMessage string) {
	if p == nil || p.client == nil || p.statusClient == nil || job.ID == "" || job.OwnerID == "" {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), redisOpTimeout)
	defer cancel()

	key := jobKeyPrefix + job.ID + ":status"
	owner, err := p.statusClient.HGet(ctx, key, "owner_id").Result()
	if err != nil {
		if !errors.Is(err, redis.Nil) {
			log.Printf("Job %s: read status owner: %v", job.ID, err)
		}
		return
	}
	if owner != job.OwnerID {
		log.Printf("Job %s: status owner mismatch; update skipped", job.ID)
		return
	}

	values := map[string]interface{}{
		"status":     status,
		"attempt":    attempt,
		"updated_at": time.Now().UTC().Format(time.RFC3339Nano),
	}
	if err := p.statusClient.HSet(ctx, key, values).Err(); err != nil {
		log.Printf("Job %s: update status to %s: %v", job.ID, status, err)
		return
	}

	if errorMessage != "" {
		err = p.statusClient.HSet(ctx, key, "error", errorMessage).Err()
	} else {
		err = p.statusClient.HDel(ctx, key, "error").Err()
	}
	if err != nil {
		log.Printf("Job %s: update status error field: %v", job.ID, err)
	}

	if err := p.statusClient.Expire(ctx, key, jobCompletedTTL).Err(); err != nil {
		log.Printf("Job %s: refresh status TTL: %v", job.ID, err)
	}
}
