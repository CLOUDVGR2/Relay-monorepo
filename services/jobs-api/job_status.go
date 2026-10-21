// Package main contains job status logic for the Relay jobs API.

package main

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	redis "github.com/redis/go-redis/v9"
)

const (
	statusKeyPrefix = "go-worker:job:"
	userJobsPrefix  = "go-worker:user:"
	jobStatusTTL    = 30 * 24 * time.Hour
)

var ErrJobStatusNotFound = errors.New("job status not found")

type JobStatus struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Status    string    `json:"status"`
	Attempt   int       `json:"attempt"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
	Error     string    `json:"error,omitempty"`
}

type jobStatusStore interface {
	Create(context.Context, Job, string) error
	Update(context.Context, string, string, string, int, string) error
	List(context.Context, string, int) ([]JobStatus, error)
	Get(context.Context, string, string) (JobStatus, error)
}

type redisJobStatusStore struct {
	client *redis.Client
}

func newRedisJobStatusStore(client *redis.Client) *redisJobStatusStore {
	return &redisJobStatusStore{client: client}
}

func statusKey(id string) string {
	return statusKeyPrefix + id + ":status"
}

func userJobsKey(ownerID string) string {
	return userJobsPrefix + hex.EncodeToString([]byte(ownerID)) + ":jobs"
}

func (s *redisJobStatusStore) Create(
	ctx context.Context,
	job Job,
	ownerID string,
) error {
	if s == nil || s.client == nil {
		return errors.New("job status Redis client is unavailable")
	}

	job.ID = strings.TrimSpace(job.ID)
	ownerID = strings.TrimSpace(ownerID)
	if job.ID == "" || ownerID == "" {
		return errors.New("job ID and owner ID are required")
	}

	now := time.Now().UTC()
	key := statusKey(job.ID)
	indexKey := userJobsKey(ownerID)

	_, err := s.client.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
		pipe.HSet(ctx, key, map[string]interface{}{
			"id":         job.ID,
			"owner_id":   ownerID,
			"type":       job.Type,
			"status":     "queued",
			"attempt":    0,
			"created_at": now.Format(time.RFC3339Nano),
			"updated_at": now.Format(time.RFC3339Nano),
		})
		pipe.Expire(ctx, key, jobStatusTTL)
		pipe.ZAdd(ctx, indexKey, redis.Z{
			Score:  float64(now.UnixMilli()),
			Member: job.ID,
		})
		pipe.Expire(ctx, indexKey, jobStatusTTL)
		return nil
	})
	if err != nil {
		return fmt.Errorf("create job status: %w", err)
	}

	return nil
}

func (s *redisJobStatusStore) Update(
	ctx context.Context,
	id string,
	ownerID string,
	status string,
	attempt int,
	errorMessage string,
) error {
	if s == nil || s.client == nil {
		return errors.New("job status Redis client is unavailable")
	}

	id = strings.TrimSpace(id)
	ownerID = strings.TrimSpace(ownerID)
	status = strings.TrimSpace(status)
	if id == "" || ownerID == "" || status == "" {
		return errors.New("job ID, owner ID, and status are required")
	}

	key := statusKey(id)
	indexKey := userJobsKey(ownerID)

	recordOwner, err := s.client.HGet(ctx, key, "owner_id").Result()
	if errors.Is(err, redis.Nil) || (err == nil && recordOwner != ownerID) {
		return ErrJobStatusNotFound
	}
	if err != nil {
		return fmt.Errorf("verify job status owner: %w", err)
	}

	now := time.Now().UTC()
	_, err = s.client.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
		pipe.HSet(ctx, key, map[string]interface{}{
			"status":     status,
			"attempt":    attempt,
			"updated_at": now.Format(time.RFC3339Nano),
		})
		if errorMessage == "" {
			pipe.HDel(ctx, key, "error")
		} else {
			pipe.HSet(ctx, key, "error", errorMessage)
		}
		pipe.Expire(ctx, key, jobStatusTTL)
		pipe.Expire(ctx, indexKey, jobStatusTTL)
		return nil
	})
	if err != nil {
		return fmt.Errorf("update job status: %w", err)
	}

	return nil
}

func (s *redisJobStatusStore) read(
	ctx context.Context,
	id string,
	ownerID string,
) (JobStatus, bool, error) {
	values, err := s.client.HGetAll(ctx, statusKey(id)).Result()
	if err != nil {
		return JobStatus{}, false, fmt.Errorf("read job status: %w", err)
	}
	if len(values) == 0 || values["owner_id"] != ownerID {
		return JobStatus{}, false, nil
	}

	attempt, err := strconv.Atoi(values["attempt"])
	if err != nil {
		return JobStatus{}, false, fmt.Errorf("invalid stored job attempt: %w", err)
	}

	createdAt, err := time.Parse(time.RFC3339Nano, values["created_at"])
	if err != nil {
		return JobStatus{}, false, fmt.Errorf("invalid stored job creation time: %w", err)
	}

	updatedAt, err := time.Parse(time.RFC3339Nano, values["updated_at"])
	if err != nil {
		return JobStatus{}, false, fmt.Errorf("invalid stored job update time: %w", err)
	}

	return JobStatus{
		ID:        values["id"],
		Type:      values["type"],
		Status:    values["status"],
		Attempt:   attempt,
		CreatedAt: createdAt,
		UpdatedAt: updatedAt,
		Error:     values["error"],
	}, true, nil
}

func (s *redisJobStatusStore) Get(
	ctx context.Context,
	ownerID string,
	id string,
) (JobStatus, error) {
	if s == nil || s.client == nil {
		return JobStatus{}, errors.New("job status Redis client is unavailable")
	}

	ownerID = strings.TrimSpace(ownerID)
	id = strings.TrimSpace(id)
	if ownerID == "" || id == "" {
		return JobStatus{}, ErrJobStatusNotFound
	}

	status, found, err := s.read(ctx, id, ownerID)
	if err != nil {
		return JobStatus{}, err
	}
	if !found {
		return JobStatus{}, ErrJobStatusNotFound
	}

	return status, nil
}

func (s *redisJobStatusStore) List(
	ctx context.Context,
	ownerID string,
	limit int,
) ([]JobStatus, error) {
	if s == nil || s.client == nil {
		return nil, errors.New("job status Redis client is unavailable")
	}

	ownerID = strings.TrimSpace(ownerID)
	if ownerID == "" {
		return nil, errors.New("owner ID is required")
	}
	if limit < 1 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}

	ids, err := s.client.ZRevRange(ctx, userJobsKey(ownerID), 0, int64(limit-1)).Result()
	if err != nil {
		return nil, fmt.Errorf("list job history: %w", err)
	}

	results := make([]JobStatus, 0, len(ids))
	for _, id := range ids {
		status, found, err := s.read(ctx, id, ownerID)
		if err != nil {
			return nil, err
		}
		if found {
			results = append(results, status)
		}
	}

	return results, nil
}
