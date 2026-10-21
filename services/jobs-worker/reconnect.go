// Package main contains reconnect logic for the Relay jobs worker.

package main

import (
	"context"
	"fmt"
	"time"
)

const (
	initialReconnectDelay = time.Second
	maxReconnectDelay     = 30 * time.Second
)

// reconnectAttempt reports whether an unsuccessful attempt should be retried.
type reconnectAttempt func(context.Context) (retry bool, err error)

// runReconnectLoop retries recoverable failures with bounded exponential backoff.
// An attempt returns retry=false when the worker should stop.
func runReconnectLoop(
	ctx context.Context,
	attempt reconnectAttempt,
	wait func(context.Context, time.Duration) error,
	initialDelay time.Duration,
	maxDelay time.Duration,
) error {
	if attempt == nil {
		return fmt.Errorf("reconnect attempt must not be nil")
	}
	if wait == nil {
		return fmt.Errorf("reconnect wait function must not be nil")
	}
	if initialDelay <= 0 || maxDelay < initialDelay {
		return fmt.Errorf("invalid reconnect delays: initial=%v max=%v",
			initialDelay, maxDelay)
	}

	delay := initialDelay

	for {
		if err := ctx.Err(); err != nil {
			return err
		}

		retry, err := attempt(ctx)
		if !retry {
			return err
		}

		if ctx.Err() != nil {
			return ctx.Err()
		}

		if waitErr := wait(ctx, delay); waitErr != nil {
			return waitErr
		}

		if delay >= maxDelay/2 {
			delay = maxDelay
		} else {
			delay *= 2
		}
	}
}

// waitForReconnectDelay waits unless shutdown is requested first.
func waitForReconnectDelay(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
