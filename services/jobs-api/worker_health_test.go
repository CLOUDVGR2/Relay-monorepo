// Package main contains tests for worker health test in the Relay jobs API.

package main

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	redis "github.com/redis/go-redis/v9"
)

func newWorkerHealthTestChecker(t *testing.T) (*miniredis.Miniredis, *redis.Client, *redisWorkerHealthChecker) {
	t.Helper()

	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() {
		_ = client.Close()
	})

	return server, client, &redisWorkerHealthChecker{client: client}
}

func TestRedisWorkerHealthCheckerReadyWithHeartbeat(t *testing.T) {
	server, client, checker := newWorkerHealthTestChecker(t)

	if err := client.Set(context.Background(), workerHealthHeartbeatKey, "alive", 15*time.Second).Err(); err != nil {
		t.Fatalf("set heartbeat: %v", err)
	}

	if !checker.Ready(context.Background()) {
		t.Fatal("Ready() = false, want true")
	}

	if !server.Exists(workerHealthHeartbeatKey) {
		t.Fatal("heartbeat key should exist")
	}
}

func TestRedisWorkerHealthCheckerNotReadyWithoutHeartbeat(t *testing.T) {
	_, _, checker := newWorkerHealthTestChecker(t)

	if checker.Ready(context.Background()) {
		t.Fatal("Ready() = true without heartbeat, want false")
	}
}

func TestRedisWorkerHealthCheckerNotReadyWithExpiredHeartbeat(t *testing.T) {
	server, client, checker := newWorkerHealthTestChecker(t)

	if err := client.Set(context.Background(), workerHealthHeartbeatKey, "alive", 15*time.Second).Err(); err != nil {
		t.Fatalf("set heartbeat: %v", err)
	}

	server.FastForward(16 * time.Second)

	if checker.Ready(context.Background()) {
		t.Fatal("Ready() = true with expired heartbeat, want false")
	}
}

func TestRedisWorkerHealthCheckerNotReadyWithNilClient(t *testing.T) {
	checker := &redisWorkerHealthChecker{}

	if checker.Ready(context.Background()) {
		t.Fatal("Ready() = true with nil client, want false")
	}
}

func TestRedisWorkerHealthCheckerNotReadyWithNilChecker(t *testing.T) {
	var checker *redisWorkerHealthChecker

	if checker.Ready(context.Background()) {
		t.Fatal("Ready() = true with nil checker, want false")
	}
}
