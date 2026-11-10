// Package main contains worker health logic for the Relay jobs API.

package main

import (
	"context"
	"encoding/json"
	"time"

	redis "github.com/redis/go-redis/v9"
)

const (
	workerHealthHeartbeatKey = "go-worker:heartbeat"
	workerHealthCheckTimeout = time.Second
	workerHealthFreshness    = 15 * time.Second
)

type workerHealth struct {
	Worker        string `json:"worker"`
	Status        string `json:"status"`
	UpdatedAt     string `json:"updated_at,omitempty"`
	LastPollAt    string `json:"last_poll_at,omitempty"`
	LastPollError string `json:"last_poll_error,omitempty"`
}

type workerHealthSnapshot struct {
	Workers []workerHealth `json:"workers"`
}

type processHeartbeat struct {
	Worker        string  `json:"worker"`
	Status        string  `json:"status"`
	UpdatedAt     string  `json:"updated_at"`
	LastPollAt    *string `json:"last_poll_at"`
	LastPollError *string `json:"last_poll_error"`
}

func (c *redisWorkerHealthChecker) Snapshot(parent context.Context) workerHealthSnapshot {
	workers := []workerHealth{
		{Worker: "go-worker", Status: "unknown"},
		{Worker: "recording-worker", Status: "unknown"},
		{Worker: "multi-agent-worker", Status: "unknown"},
	}
	if c == nil || c.client == nil {
		return workerHealthSnapshot{Workers: workers}
	}

	ctx, cancel := context.WithTimeout(parent, workerHealthCheckTimeout)
	defer cancel()

	keys := []string{
		workerHealthHeartbeatKey,
		"recording-worker:heartbeat",
		"multi-agent-worker:heartbeat",
	}
	for i, key := range keys {
		value, err := c.client.Get(ctx, key).Result()
		if err == redis.Nil {
			workers[i].Status = "missing"
			continue
		}
		if err != nil {
			workers[i].Status = "unknown"
			continue
		}

		var updatedAt string
		if i == 0 {
			updatedAt = value
		} else {
			var payload processHeartbeat
			if err := json.Unmarshal([]byte(value), &payload); err != nil {
				workers[i].Status = "unknown"
				continue
			}
			updatedAt = payload.UpdatedAt
			workers[i].LastPollAt = optionalString(payload.LastPollAt)
			workers[i].LastPollError = optionalString(payload.LastPollError)
			workers[i].Status = payload.Status
		}

		stamp, err := time.Parse(time.RFC3339Nano, updatedAt)
		if err != nil {
			workers[i].Status = "unknown"
			continue
		}
		workers[i].UpdatedAt = stamp.UTC().Format(time.RFC3339Nano)
		if time.Since(stamp) > workerHealthFreshness || time.Until(stamp) > workerHealthFreshness {
			workers[i].Status = "stale"
			continue
		}
		if i == 0 {
			workers[i].Status = "online"
		}
	}
	return workerHealthSnapshot{Workers: workers}
}

func optionalString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

type workerHealthSnapshotter interface {
	Snapshot(context.Context) workerHealthSnapshot
}

type workerHealthChecker interface {
	Ready(context.Context) bool
}

type redisWorkerHealthChecker struct {
	client *redis.Client
}

func (c *redisWorkerHealthChecker) Ready(parent context.Context) bool {
	if c == nil || c.client == nil {
		return false
	}

	ctx, cancel := context.WithTimeout(parent, workerHealthCheckTimeout)
	defer cancel()

	err := c.client.Get(ctx, workerHealthHeartbeatKey).Err()
	return err == nil
}
