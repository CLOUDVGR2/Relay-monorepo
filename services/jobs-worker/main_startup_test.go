// Package main contains tests for main startup test in the Relay jobs worker.

package main

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	redis "github.com/redis/go-redis/v9"
)

func TestRunWorkerRedisInitializationFailure(t *testing.T) {
	wantErr := errors.New("Redis unavailable")
	started := false

	err := runWorker(
		context.Background(),
		func(context.Context) (*redis.Client, error) {
			return nil, wantErr
		},
		func() (string, error) {
			t.Fatal("RabbitMQ URL should not be requested")
			return "", nil
		},
		func(context.Context, string, *JobProcessor) {
			started = true
		},
	)

	if !errors.Is(err, wantErr) {
		t.Fatalf("runWorker() error = %v, want %v", err, wantErr)
	}
	if started {
		t.Fatal("worker sessions started after Redis initialization failed")
	}
}

func TestRunWorkerRabbitMQConfigurationFailure(t *testing.T) {
	client := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})
	t.Cleanup(func() {
		_ = client.Close()
	})

	wantErr := errors.New("missing RabbitMQ credentials")
	started := false

	err := runWorker(
		context.Background(),
		func(context.Context) (*redis.Client, error) {
			return client, nil
		},
		func() (string, error) {
			return "", wantErr
		},
		func(context.Context, string, *JobProcessor) {
			started = true
		},
	)

	if !errors.Is(err, wantErr) {
		t.Fatalf("runWorker() error = %v, want %v", err, wantErr)
	}
	if !strings.Contains(err.Error(), "configure RabbitMQ") {
		t.Fatalf("runWorker() error lacks configuration context: %v", err)
	}
	if started {
		t.Fatal("worker sessions started after RabbitMQ configuration failed")
	}

	// runWorker should have closed the Redis client on the error path.
	if err := client.Ping(context.Background()).Err(); err == nil {
		t.Fatal("expected Redis client to be closed")
	}
}

func TestRunWorkerStartsSessions(t *testing.T) {
	client := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})
	t.Cleanup(func() {
		_ = client.Close()
	})

	ctx := context.Background()
	const wantURL = "amqp://test"
	started := false

	err := runWorker(
		ctx,
		func(gotCtx context.Context) (*redis.Client, error) {
			if gotCtx != ctx {
				t.Fatal("Redis initializer received unexpected context")
			}
			return client, nil
		},
		func() (string, error) {
			return wantURL, nil
		},
		func(gotCtx context.Context, gotURL string, processor *JobProcessor) {
			started = true

			if gotCtx != ctx {
				t.Error("session runner received unexpected context")
			}
			if gotURL != wantURL {
				t.Errorf("session URL = %q, want %q", gotURL, wantURL)
			}
			if processor == nil {
				t.Fatal("session runner received nil processor")
			}
			if processor.client != client {
				t.Error("processor does not use the initialized Redis client")
			}
		},
	)

	if err != nil {
		t.Fatalf("runWorker() error = %v", err)
	}
	if !started {
		t.Fatal("worker sessions were not started")
	}

	// The Redis client should be closed when runWorker returns.
	if err := client.Ping(context.Background()).Err(); err == nil {
		t.Fatal("expected Redis client to be closed")
	}
}
func TestRunWorkerSessionsSuccess(t *testing.T) {
	ctx := context.Background()
	processor := &JobProcessor{}
	const connectionURL = "amqp://test"

	attempts := 0
	waits := 0

	runWorkerSessionsWithDependencies(
		ctx,
		connectionURL,
		processor,
		func(
			gotCtx context.Context,
			gotURL string,
			gotProcessor *JobProcessor,
		) error {
			attempts++

			if gotCtx != ctx {
				t.Error("session received unexpected context")
			}
			if gotURL != connectionURL {
				t.Errorf("URL = %q, want %q", gotURL, connectionURL)
			}
			if gotProcessor != processor {
				t.Error("session received unexpected processor")
			}

			return nil
		},
		func(context.Context, time.Duration) error {
			waits++
			return nil
		},
	)

	if attempts != 1 {
		t.Errorf("session attempts = %d, want 1", attempts)
	}
	if waits != 0 {
		t.Errorf("waits = %d, want 0", waits)
	}
}

func TestRunWorkerSessionsRetriesAfterFailure(t *testing.T) {
	ctx := context.Background()
	wantErr := errors.New("temporary RabbitMQ failure")

	attempts := 0
	waits := 0

	runWorkerSessionsWithDependencies(
		ctx,
		"amqp://test",
		&JobProcessor{},
		func(
			context.Context,
			string,
			*JobProcessor,
		) error {
			attempts++

			if attempts == 1 {
				return wantErr
			}

			return nil
		},
		func(_ context.Context, delay time.Duration) error {
			waits++

			if delay != initialReconnectDelay {
				t.Errorf(
					"first retry delay = %v, want %v",
					delay,
					initialReconnectDelay,
				)
			}

			return nil
		},
	)

	if attempts != 2 {
		t.Errorf("session attempts = %d, want 2", attempts)
	}
	if waits != 1 {
		t.Errorf("waits = %d, want 1", waits)
	}
}

func TestRunWorkerSessionsStopsOnCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	attempts := 0
	waits := 0

	runWorkerSessionsWithDependencies(
		ctx,
		"amqp://test",
		&JobProcessor{},
		func(
			_ context.Context,
			_ string,
			_ *JobProcessor,
		) error {
			attempts++
			cancel()
			return errors.New("session interrupted")
		},
		func(context.Context, time.Duration) error {
			waits++
			return nil
		},
	)

	if attempts != 1 {
		t.Errorf("session attempts = %d, want 1", attempts)
	}
	if waits != 0 {
		t.Errorf("waits = %d, want 0", waits)
	}
}

func TestRunWorkerSessionsStopsWhenCanceledSessionReturnsNil(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	attempts := 0
	waits := 0

	runWorkerSessionsWithDependencies(
		ctx,
		"amqp://test",
		&JobProcessor{},
		func(
			_ context.Context,
			_ string,
			_ *JobProcessor,
		) error {
			attempts++
			cancel()
			return nil
		},
		func(context.Context, time.Duration) error {
			waits++
			return nil
		},
	)

	if attempts != 1 {
		t.Errorf("session attempts = %d, want 1", attempts)
	}
	if waits != 0 {
		t.Errorf("waits = %d, want 0", waits)
	}
}

func TestRunWorkerSessionsStopsWhenReconnectWaitFails(t *testing.T) {
	ctx := context.Background()
	wantErr := errors.New("reconnect wait failed")

	attempts := 0
	waits := 0

	runWorkerSessionsWithDependencies(
		ctx,
		"amqp://test",
		&JobProcessor{},
		func(
			context.Context,
			string,
			*JobProcessor,
		) error {
			attempts++
			return errors.New("temporary RabbitMQ failure")
		},
		func(
			_ context.Context,
			_ time.Duration,
		) error {
			waits++
			return wantErr
		},
	)

	if attempts != 1 {
		t.Errorf("session attempts = %d, want 1", attempts)
	}

	if waits != 1 {
		t.Errorf("waits = %d, want 1", waits)
	}
}

func TestRunWorkerSessions_CanceledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	runWorkerSessions(ctx, "amqp://unused", nil)
}

func TestCloseRedisClientLogsCloseError(t *testing.T) {
	wantErr := errors.New("Redis close failed")

	closeRedisClient(func() error {
		return wantErr
	})
}

func TestRunWorkerEntrypointRedisInitializationFailure(t *testing.T) {
	wantErr := errors.New("Redis unavailable")

	err := runWorkerEntrypoint(
		func(context.Context) (*redis.Client, error) {
			return nil, wantErr
		},
		func() (string, error) {
			t.Fatal("RabbitMQ URL should not be requested")
			return "", nil
		},
		func(context.Context, string, *JobProcessor) {
			t.Fatal("worker sessions should not start")
		},
	)

	if !errors.Is(err, wantErr) {
		t.Fatalf("runWorkerEntrypoint() error = %v, want %v", err, wantErr)
	}
}

func TestMainSuccess(t *testing.T) {
	oldEntrypoint := runWorkerEntrypointForMain
	oldFatalf := fatalfForMain
	t.Cleanup(func() {
		runWorkerEntrypointForMain = oldEntrypoint
		fatalfForMain = oldFatalf
	})

	called := false
	runWorkerEntrypointForMain = func(
		_ func(context.Context) (*redis.Client, error),
		_ func() (string, error),
		_ func(context.Context, string, *JobProcessor),
	) error {
		called = true
		return nil
	}
	fatalfForMain = func(string, ...any) {
		t.Error("fatal logger called on successful startup")
	}

	main()

	if !called {
		t.Fatal("worker entrypoint was not called")
	}
}

func TestMainStartupFailure(t *testing.T) {
	oldEntrypoint := runWorkerEntrypointForMain
	oldFatalf := fatalfForMain
	t.Cleanup(func() {
		runWorkerEntrypointForMain = oldEntrypoint
		fatalfForMain = oldFatalf
	})

	wantErr := errors.New("startup failed")
	runWorkerEntrypointForMain = func(
		_ func(context.Context) (*redis.Client, error),
		_ func() (string, error),
		_ func(context.Context, string, *JobProcessor),
	) error {
		return wantErr
	}

	fatalCalled := false
	fatalfForMain = func(format string, args ...any) {
		fatalCalled = true
		if format != "worker startup: %v" {
			t.Errorf("fatal format = %q", format)
		}
		if len(args) != 1 || args[0] != wantErr {
			t.Errorf("fatal arguments = %v, want startup error", args)
		}
	}

	main()

	if !fatalCalled {
		t.Fatal("fatal logger was not called on startup failure")
	}
}
