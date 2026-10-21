// Package main contains tests for redis test in the Relay jobs worker.

package main

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
)

func TestNewRedisClientRequiresURL(t *testing.T) {
	t.Setenv("REDIS_URL", "")

	client, err := newRedisClient(context.Background())

	if err == nil {
		if client != nil {
			_ = client.Close()
		}
		t.Fatal("newRedisClient() expected an error when REDIS_URL is missing")
	}

	if !strings.Contains(err.Error(), "REDIS_URL must be set") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestNewRedisClientRejectsMalformedURL(t *testing.T) {
	t.Setenv("REDIS_URL", "redis://%zz")

	client, err := newRedisClient(context.Background())

	if err == nil {
		if client != nil {
			_ = client.Close()
		}
		t.Fatal("newRedisClient() expected a URL parsing error")
	}

	if !strings.Contains(err.Error(), "parse REDIS_URL") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestNewRedisClientRejectsUnsupportedScheme(t *testing.T) {
	t.Setenv("REDIS_URL", "http://localhost:6379")

	client, err := newRedisClient(context.Background())

	if err == nil {
		if client != nil {
			_ = client.Close()
		}
		t.Fatal("newRedisClient() expected an unsupported scheme error")
	}

	if !strings.Contains(err.Error(), "redis:// or rediss://") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestNewRedisClientRejectsInvalidConfiguration(t *testing.T) {
	t.Setenv("REDIS_URL", "redis://localhost:6379/not-a-database")

	client, err := newRedisClient(context.Background())

	if err == nil {
		if client != nil {
			_ = client.Close()
		}
		t.Fatal("newRedisClient() expected a configuration error")
	}

	if !strings.Contains(err.Error(), "configure Redis client") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestNewRedisClientReturnsConnectionError(t *testing.T) {
	t.Setenv("REDIS_URL", "redis://127.0.0.1:1")

	ctx, cancel := context.WithTimeout(
		context.Background(),
		2*time.Second,
	)
	defer cancel()

	client, err := newRedisClient(ctx)

	if err == nil {
		if client != nil {
			_ = client.Close()
		}
		t.Fatal("newRedisClient() expected a connection error")
	}

	if client != nil {
		t.Fatal("newRedisClient() should return a nil client on failure")
	}

	if !strings.Contains(err.Error(), "connect to Redis") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestNewRedisClientSuccess(t *testing.T) {
	server, err := miniredis.Run()
	if err != nil {
		t.Fatalf("start test Redis: %v", err)
	}
	t.Cleanup(server.Close)

	t.Setenv("REDIS_URL", "redis://"+server.Addr())

	client, err := newRedisClient(context.Background())
	if err != nil {
		t.Fatalf("newRedisClient() error = %v", err)
	}
	if client == nil {
		t.Fatal("newRedisClient() returned a nil client")
	}
	t.Cleanup(func() {
		if err := client.Close(); err != nil {
			t.Errorf("close Redis client: %v", err)
		}
	})

	if err := client.Ping(context.Background()).Err(); err != nil {
		t.Fatalf("Redis ping failed: %v", err)
	}
}
