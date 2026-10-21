// Package main contains worker health logic for the Relay jobs API.

package main

import (
	"context"
	"time"

	redis "github.com/redis/go-redis/v9"
)

const (
	workerHealthHeartbeatKey = "go-worker:heartbeat"
	workerHealthCheckTimeout = time.Second
)

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
