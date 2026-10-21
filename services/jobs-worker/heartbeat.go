// Package main contains heartbeat logic for the Relay jobs worker.

package main

import (
	"context"
	"fmt"
	"time"

	redis "github.com/redis/go-redis/v9"
)

const (
	workerHeartbeatKey      = "go-worker:heartbeat"
	workerHeartbeatInterval = 5 * time.Second
	workerHeartbeatTTL      = 15 * time.Second
)

type workerHeartbeatStore interface {
	Set(context.Context, string, interface{}, time.Duration) *redis.StatusCmd
	Del(context.Context, ...string) *redis.IntCmd
}

// publishWorkerHeartbeat refreshes the heartbeat while the consumer session
// is active. The key expires automatically if the worker stops refreshing it.
func publishWorkerHeartbeat(
	ctx context.Context,
	store workerHeartbeatStore,
) error {
	if store == nil {
		return fmt.Errorf("worker heartbeat store is unavailable")
	}

	return store.Set(
		ctx,
		workerHeartbeatKey,
		time.Now().UTC().Format(time.RFC3339Nano),
		workerHeartbeatTTL,
	).Err()
}

// runWorkerHeartbeat publishes immediately, then refreshes periodically.
// It returns when the session context is canceled or Redis reports an error.
var runWorkerHeartbeatForSession = runWorkerHeartbeat

func runWorkerHeartbeat(
	ctx context.Context,
	store workerHeartbeatStore,
	interval time.Duration,
) error {
	if interval <= 0 {
		return fmt.Errorf("worker heartbeat interval must be positive")
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	if err := publishWorkerHeartbeat(ctx, store); err != nil {
		return fmt.Errorf("publish worker heartbeat: %w", err)
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if err := publishWorkerHeartbeat(ctx, store); err != nil {
				return fmt.Errorf("refresh worker heartbeat: %w", err)
			}
		}
	}
}
