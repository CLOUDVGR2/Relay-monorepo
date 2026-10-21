// Package main contains tests for idempotency status failure test in the Relay jobs worker.

package main

import (
	"context"
	"errors"
	"testing"
	"time"

	redis "github.com/redis/go-redis/v9"
)

type scriptedJobStatusClient struct {
	jobStatusClient

	hgetErr    error
	hsetErr    error
	hsetFailAt int
	hsetCalls  int
	hdelErr    error
	expireErr  error
}

func (s *scriptedJobStatusClient) HGet(
	ctx context.Context,
	key, field string,
) *redis.StringCmd {
	if s.hgetErr != nil {
		cmd := redis.NewStringCmd(ctx)
		cmd.SetErr(s.hgetErr)
		return cmd
	}
	return s.jobStatusClient.HGet(ctx, key, field)
}

func (s *scriptedJobStatusClient) HSet(
	ctx context.Context,
	key string,
	values ...interface{},
) *redis.IntCmd {
	s.hsetCalls++
	if s.hsetErr != nil && s.hsetCalls == s.hsetFailAt {
		cmd := redis.NewIntCmd(ctx)
		cmd.SetErr(s.hsetErr)
		return cmd
	}
	return s.jobStatusClient.HSet(ctx, key, values...)
}

func (s *scriptedJobStatusClient) HDel(
	ctx context.Context,
	key string,
	fields ...string,
) *redis.IntCmd {
	if s.hdelErr != nil {
		cmd := redis.NewIntCmd(ctx)
		cmd.SetErr(s.hdelErr)
		return cmd
	}
	return s.jobStatusClient.HDel(ctx, key, fields...)
}

func (s *scriptedJobStatusClient) Expire(
	ctx context.Context,
	key string,
	expiration time.Duration,
) *redis.BoolCmd {
	if s.expireErr != nil {
		cmd := redis.NewBoolCmd(ctx)
		cmd.SetErr(s.expireErr)
		return cmd
	}
	return s.jobStatusClient.Expire(ctx, key, expiration)
}

func TestUpdateJobStatusRedisFailures(t *testing.T) {
	tests := []struct {
		name         string
		configure    func(*scriptedJobStatusClient)
		errorMessage string
	}{
		{
			name: "owner lookup error",
			configure: func(s *scriptedJobStatusClient) {
				s.hgetErr = errors.New("simulated owner lookup failure")
			},
			errorMessage: "processing failed",
		},
		{
			name: "main status write error",
			configure: func(s *scriptedJobStatusClient) {
				s.hsetErr = errors.New("simulated status write failure")
				s.hsetFailAt = 1
			},
			errorMessage: "processing failed",
		},
		{
			name: "error field write error",
			configure: func(s *scriptedJobStatusClient) {
				s.hsetErr = errors.New("simulated error field write failure")
				s.hsetFailAt = 2
			},
			errorMessage: "processing failed",
		},
		{
			name: "error field delete error",
			configure: func(s *scriptedJobStatusClient) {
				s.hdelErr = errors.New("simulated error field delete failure")
			},
		},
		{
			name: "TTL refresh error",
			configure: func(s *scriptedJobStatusClient) {
				s.expireErr = errors.New("simulated TTL refresh failure")
			},
			errorMessage: "processing failed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			processor := newTestJobProcessor(t)
			job := validIdempotencyTestJob("status-failure-" + testSafeName(tt.name))
			job.OwnerID = "owner-" + job.ID

			ctx := context.Background()
			key := jobKeyPrefix + job.ID + ":status"

			if err := processor.client.HSet(
				ctx, key, "owner_id", job.OwnerID,
			).Err(); err != nil {
				t.Fatalf("seed status record: %v", err)
			}

			fake := &scriptedJobStatusClient{
				jobStatusClient: processor.client,
			}
			tt.configure(fake)
			processor.statusClient = fake

			processor.updateJobStatus(job, "failed", 2, tt.errorMessage)
		})
	}
}

func testSafeName(name string) string {
	result := make([]byte, 0, len(name))
	for _, r := range name {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' ||
			r >= '0' && r <= '9' || r == '-' {
			result = append(result, byte(r))
		} else {
			result = append(result, '-')
		}
	}
	return string(result)
}
