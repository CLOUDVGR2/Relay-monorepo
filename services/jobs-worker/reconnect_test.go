// Package main contains tests for reconnect test in the Relay jobs worker.

package main

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestRunReconnectLoopRetriesWithBoundedBackoff(t *testing.T) {
	ctx := context.Background()
	attempts := 0
	var delays []time.Duration

	attempt := func(context.Context) (bool, error) {
		attempts++
		if attempts < 4 {
			return true, errors.New("temporary connection failure")
		}
		return false, nil
	}

	wait := func(_ context.Context, delay time.Duration) error {
		delays = append(delays, delay)
		return nil
	}

	err := runReconnectLoop(ctx, attempt, wait, time.Second, 4*time.Second)
	if err != nil {
		t.Fatalf("runReconnectLoop() error = %v, want nil", err)
	}

	if attempts != 4 {
		t.Fatalf("attempts = %d, want 4", attempts)
	}

	wantDelays := []time.Duration{
		time.Second,
		2 * time.Second,
		4 * time.Second,
	}
	if len(delays) != len(wantDelays) {
		t.Fatalf("delays = %v, want %v", delays, wantDelays)
	}
	for i, want := range wantDelays {
		if delays[i] != want {
			t.Errorf("delays[%d] = %v, want %v", i, delays[i], want)
		}
	}
}

func TestRunReconnectLoopStopsWhenContextCanceled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	attempts := 0
	attempt := func(context.Context) (bool, error) {
		attempts++
		return true, errors.New("temporary failure")
	}

	wait := func(context.Context, time.Duration) error {
		cancel()
		return context.Canceled
	}

	err := runReconnectLoop(ctx, attempt, wait, time.Second, 4*time.Second)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("runReconnectLoop() error = %v, want context.Canceled", err)
	}

	if attempts != 1 {
		t.Fatalf("attempts = %d, want 1", attempts)
	}
}

func TestRunReconnectLoopStopsOnNonRetryableResult(t *testing.T) {
	wantErr := errors.New("permanent failure")
	attempts := 0

	err := runReconnectLoop(
		context.Background(),
		func(context.Context) (bool, error) {
			attempts++
			return false, wantErr
		},
		func(context.Context, time.Duration) error {
			t.Fatal("wait should not be called for a non-retryable result")
			return nil
		},
		time.Second,
		4*time.Second,
	)

	if !errors.Is(err, wantErr) {
		t.Fatalf("runReconnectLoop() error = %v, want %v", err, wantErr)
	}
	if attempts != 1 {
		t.Fatalf("attempts = %d, want 1", attempts)
	}
}

func TestRunReconnectLoopDoesNotAttemptAfterCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	attempts := 0

	err := runReconnectLoop(
		ctx,
		func(context.Context) (bool, error) {
			attempts++
			return true, errors.New("unexpected attempt")
		},
		func(context.Context, time.Duration) error {
			t.Fatal("wait should not be called")
			return nil
		},
		time.Second,
		4*time.Second,
	)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("runReconnectLoop() error = %v, want context.Canceled", err)
	}
	if attempts != 0 {
		t.Fatalf("attempts = %d, want 0", attempts)
	}
}

func TestRunReconnectLoopReturnsWaitError(t *testing.T) {
	wantErr := errors.New("wait failed")
	attempts := 0

	err := runReconnectLoop(
		context.Background(),
		func(context.Context) (bool, error) {
			attempts++
			return true, errors.New("temporary connection failure")
		},
		func(context.Context, time.Duration) error {
			return wantErr
		},
		time.Second,
		4*time.Second,
	)

	if !errors.Is(err, wantErr) {
		t.Fatalf("runReconnectLoop() error = %v, want %v", err, wantErr)
	}
	if attempts != 1 {
		t.Fatalf("attempts = %d, want 1", attempts)
	}
}
func TestWaitForReconnectDelayReturnsNilWhenTimerExpires(t *testing.T) {
	err := waitForReconnectDelay(context.Background(), time.Millisecond)
	if err != nil {
		t.Fatalf("waitForReconnectDelay() error = %v, want nil", err)
	}
}

func TestWaitForReconnectDelayReturnsErrorWhenContextCanceled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := waitForReconnectDelay(ctx, time.Hour)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("waitForReconnectDelay() error = %v, want context.Canceled", err)
	}
}

func TestRunReconnectLoopRejectsInvalidConfiguration(t *testing.T) {
	validAttempt := func(context.Context) (bool, error) {
		return false, nil
	}
	validWait := func(context.Context, time.Duration) error {
		return nil
	}

	tests := []struct {
		name         string
		attempt      reconnectAttempt
		wait         func(context.Context, time.Duration) error
		initialDelay time.Duration
		maxDelay     time.Duration
	}{
		{
			name:         "nil attempt",
			attempt:      nil,
			wait:         validWait,
			initialDelay: time.Second,
			maxDelay:     2 * time.Second,
		},
		{
			name:         "nil wait",
			attempt:      validAttempt,
			wait:         nil,
			initialDelay: time.Second,
			maxDelay:     2 * time.Second,
		},
		{
			name:         "zero initial delay",
			attempt:      validAttempt,
			wait:         validWait,
			initialDelay: 0,
			maxDelay:     time.Second,
		},
		{
			name:         "maximum below initial delay",
			attempt:      validAttempt,
			wait:         validWait,
			initialDelay: 2 * time.Second,
			maxDelay:     time.Second,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := runReconnectLoop(
				context.Background(),
				tt.attempt,
				tt.wait,
				tt.initialDelay,
				tt.maxDelay,
			)
			if err == nil {
				t.Fatal("runReconnectLoop() error = nil, want validation error")
			}
		})
	}
}

func TestRunReconnectLoopStopsWhenCanceledAfterAttempt(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	attempts := 0

	err := runReconnectLoop(
		ctx,
		func(context.Context) (bool, error) {
			attempts++
			cancel()
			return true, errors.New("temporary failure")
		},
		func(context.Context, time.Duration) error {
			t.Fatal("wait should not be called after cancellation")
			return nil
		},
		time.Second,
		4*time.Second,
	)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("runReconnectLoop() error = %v, want context.Canceled", err)
	}

	if attempts != 1 {
		t.Fatalf("attempts = %d, want 1", attempts)
	}
}

func TestRunReconnectLoopKeepsDelayAtMaximum(t *testing.T) {
	attempts := 0
	var delays []time.Duration

	err := runReconnectLoop(
		context.Background(),
		func(context.Context) (bool, error) {
			attempts++
			if attempts == 5 {
				return false, nil
			}
			return true, errors.New("temporary failure")
		},
		func(_ context.Context, delay time.Duration) error {
			delays = append(delays, delay)
			return nil
		},
		time.Second,
		4*time.Second,
	)
	if err != nil {
		t.Fatalf("runReconnectLoop() error = %v, want nil", err)
	}

	want := []time.Duration{
		time.Second,
		2 * time.Second,
		4 * time.Second,
		4 * time.Second,
	}

	if len(delays) != len(want) {
		t.Fatalf("delays = %v, want %v", delays, want)
	}

	for i := range want {
		if delays[i] != want[i] {
			t.Errorf("delays[%d] = %v, want %v", i, delays[i], want[i])
		}
	}
}

func TestRunReconnectLoopDoesNotRetryWhenWaitCancelsContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	attempts := 0
	waits := 0

	err := runReconnectLoop(
		ctx,
		func(context.Context) (bool, error) {
			attempts++
			return true, errors.New("temporary failure")
		},
		func(context.Context, time.Duration) error {
			waits++
			cancel()

			// Simulate a wait that returns nil despite cancellation.
			return nil
		},
		time.Second,
		4*time.Second,
	)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("runReconnectLoop() error = %v, want context.Canceled", err)
	}
	if attempts != 1 {
		t.Errorf("attempts = %d, want 1", attempts)
	}
	if waits != 1 {
		t.Errorf("waits = %d, want 1", waits)
	}
}
