// Package main contains tests for heartbeat test in the Relay jobs worker.

package main

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	redis "github.com/redis/go-redis/v9"
)

func newHeartbeatTestStore(t *testing.T) (*miniredis.Miniredis, *redis.Client) {
	t.Helper()

	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{
		Addr: server.Addr(),
	})

	t.Cleanup(func() {
		_ = client.Close()
	})

	return server, client
}

func TestPublishWorkerHeartbeat(t *testing.T) {
	server, client := newHeartbeatTestStore(t)

	if err := publishWorkerHeartbeat(context.Background(), client); err != nil {
		t.Fatalf("publishWorkerHeartbeat() error = %v", err)
	}

	value, err := server.Get(workerHeartbeatKey)
	if err != nil {
		t.Fatalf("heartbeat key not found: %v", err)
	}
	if value == "" {
		t.Fatal("heartbeat value is empty")
	}
	if ttl := server.TTL(workerHeartbeatKey); ttl <= 0 || ttl > workerHeartbeatTTL {
		t.Fatalf("heartbeat TTL = %v, want > 0 and <= %v", ttl, workerHeartbeatTTL)
	}
}

func TestPublishWorkerHeartbeatRejectsNilStore(t *testing.T) {
	if err := publishWorkerHeartbeat(context.Background(), nil); err == nil {
		t.Fatal("publishWorkerHeartbeat(nil) error = nil, want error")
	}
}

func TestRunWorkerHeartbeatStopsWhenCanceled(t *testing.T) {
	_, client := newHeartbeatTestStore(t)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := runWorkerHeartbeat(ctx, client, time.Millisecond)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("runWorkerHeartbeat() error = %v, want context.Canceled", err)
	}
}

func TestRunWorkerHeartbeatRejectsInvalidInterval(t *testing.T) {
	_, client := newHeartbeatTestStore(t)

	for _, interval := range []time.Duration{0, -time.Second} {
		if err := runWorkerHeartbeat(context.Background(), client, interval); err == nil {
			t.Errorf("runWorkerHeartbeat(interval=%v) error = nil, want error", interval)
		}
	}
}

func TestRunWorkerHeartbeatReturnsRedisError(t *testing.T) {
	server, client := newHeartbeatTestStore(t)
	server.Close()

	err := runWorkerHeartbeat(context.Background(), client, time.Millisecond)
	if err == nil {
		t.Fatal("runWorkerHeartbeat() error = nil, want Redis error")
	}
}

type scriptedHeartbeatStore struct {
	workerHeartbeatStore
	setCalls int
	failAt   int
	cancel   context.CancelFunc
}

func (s *scriptedHeartbeatStore) Set(
	ctx context.Context,
	key string,
	value interface{},
	expiration time.Duration,
) *redis.StatusCmd {
	s.setCalls++

	if s.failAt > 0 && s.setCalls == s.failAt {
		cmd := redis.NewStatusCmd(ctx)
		cmd.SetErr(errors.New("simulated heartbeat refresh failure"))
		return cmd
	}

	cmd := s.workerHeartbeatStore.Set(ctx, key, value, expiration)
	if s.cancel != nil {
		s.cancel()
	}
	return cmd
}

func TestRunWorkerHeartbeatStopsAfterCancellation(t *testing.T) {
	_, client := newHeartbeatTestStore(t)

	ctx, cancel := context.WithCancel(context.Background())
	store := &scriptedHeartbeatStore{
		workerHeartbeatStore: client,
		cancel:               cancel,
	}

	err := runWorkerHeartbeat(ctx, store, time.Hour)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("runWorkerHeartbeat() error = %v, want context.Canceled", err)
	}
	if store.setCalls != 1 {
		t.Fatalf("heartbeat Set calls = %d, want 1", store.setCalls)
	}
}

func TestRunWorkerHeartbeatReturnsRefreshError(t *testing.T) {
	_, client := newHeartbeatTestStore(t)

	store := &scriptedHeartbeatStore{
		workerHeartbeatStore: client,
		failAt:               2,
	}

	err := runWorkerHeartbeat(context.Background(), store, time.Millisecond)
	if err == nil {
		t.Fatal("runWorkerHeartbeat() error = nil, want refresh error")
	}
	if !errors.Is(err, errors.Unwrap(err)) && err.Error() == "" {
		t.Fatalf("unexpected heartbeat refresh error: %v", err)
	}
	if store.setCalls != 2 {
		t.Fatalf("heartbeat Set calls = %d, want 2", store.setCalls)
	}
}
