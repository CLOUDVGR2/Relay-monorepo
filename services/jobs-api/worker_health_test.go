// Package main contains tests for worker health test in the Relay jobs API.

package main

import (
	"context"
	"encoding/json"
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

func TestRedisWorkerHealthCheckerSnapshot(t *testing.T) {
	_, client, checker := newWorkerHealthTestChecker(t)
	now := time.Now().UTC()
	goHeartbeat := now.Format(time.RFC3339Nano)
	lastPoll := now.Add(-time.Second).Format(time.RFC3339Nano)

	if err := client.Set(context.Background(), workerHealthHeartbeatKey, goHeartbeat, 15*time.Second).Err(); err != nil {
		t.Fatalf("set Go worker heartbeat: %v", err)
	}

	for _, worker := range []struct {
		key    string
		status string
	}{
		{key: "recording-worker:heartbeat", status: "idle"},
		{key: "multi-agent-worker:heartbeat", status: "processing"},
	} {
		payload := processHeartbeat{
			Worker:        worker.key,
			Status:        worker.status,
			UpdatedAt:     now.Format(time.RFC3339Nano),
			LastPollAt:    &lastPoll,
			LastPollError: nil,
		}
		value, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal %s heartbeat: %v", worker.key, err)
		}
		if err := client.Set(context.Background(), worker.key, value, 15*time.Second).Err(); err != nil {
			t.Fatalf("set %s heartbeat: %v", worker.key, err)
		}
	}

	snapshot := checker.Snapshot(context.Background())
	if len(snapshot.Workers) != 3 {
		t.Fatalf("Snapshot returned %d workers, want 3", len(snapshot.Workers))
	}

	want := []struct {
		worker string
		status string
	}{
		{worker: "go-worker", status: "online"},
		{worker: "recording-worker", status: "idle"},
		{worker: "multi-agent-worker", status: "processing"},
	}

	for i, expected := range want {
		got := snapshot.Workers[i]
		if got.Worker != expected.worker || got.Status != expected.status {
			t.Errorf("worker[%d] = {%q, %q}, want {%q, %q}",
				i, got.Worker, got.Status, expected.worker, expected.status)
		}
		if got.UpdatedAt == "" {
			t.Errorf("%s UpdatedAt is empty", expected.worker)
		}
		if i > 0 && got.LastPollAt != lastPoll {
			t.Errorf("%s LastPollAt = %q, want %q", expected.worker, got.LastPollAt, lastPoll)
		}
	}
}

func TestRedisWorkerHealthCheckerSnapshotMissingWorkers(t *testing.T) {
	_, _, checker := newWorkerHealthTestChecker(t)

	snapshot := checker.Snapshot(context.Background())
	for _, worker := range snapshot.Workers {
		if worker.Status != "missing" {
			t.Errorf("%s status = %q, want missing", worker.Worker, worker.Status)
		}
	}
}

func TestRedisWorkerHealthCheckerSnapshotStaleHeartbeat(t *testing.T) {
	_, client, checker := newWorkerHealthTestChecker(t)
	stale := time.Now().UTC().Add(-workerHealthFreshness - time.Second).Format(time.RFC3339Nano)

	if err := client.Set(context.Background(), workerHealthHeartbeatKey, stale, 15*time.Second).Err(); err != nil {
		t.Fatalf("set stale Go worker heartbeat: %v", err)
	}

	snapshot := checker.Snapshot(context.Background())
	if got := snapshot.Workers[0].Status; got != "stale" {
		t.Errorf("Go worker status = %q, want stale", got)
	}
}

func TestRedisWorkerHealthCheckerSnapshotMalformedPayload(t *testing.T) {
	_, client, checker := newWorkerHealthTestChecker(t)

	if err := client.Set(context.Background(), "recording-worker:heartbeat", "{invalid", 15*time.Second).Err(); err != nil {
		t.Fatalf("set malformed heartbeat: %v", err)
	}

	snapshot := checker.Snapshot(context.Background())
	if got := snapshot.Workers[1].Status; got != "unknown" {
		t.Errorf("recording worker status = %q, want unknown", got)
	}
}
