// Package main contains tests for shutdown test in the Relay jobs worker.

package main

import (
	"context"
	"errors"
	"testing"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

func TestDrainMessagesProcessesAllDeliveries(t *testing.T) {
	messages := make(chan amqp.Delivery, 2)
	messages <- amqp.Delivery{}
	messages <- amqp.Delivery{}
	close(messages)

	processed := 0

	err := drainMessages(
		messages,
		func(amqp.Delivery) error {
			processed++
			return nil
		},
	)

	if err != nil {
		t.Fatalf("drainMessages() error = %v, want nil", err)
	}

	if processed != 2 {
		t.Fatalf("processed = %d, want 2", processed)
	}
}

func TestDrainMessagesStopsOnHandlerError(t *testing.T) {
	wantErr := errors.New("handler failed")

	messages := make(chan amqp.Delivery, 2)
	messages <- amqp.Delivery{}
	messages <- amqp.Delivery{}
	close(messages)

	processed := 0

	err := drainMessages(
		messages,
		func(amqp.Delivery) error {
			processed++
			return wantErr
		},
	)

	if !errors.Is(err, wantErr) {
		t.Fatalf("drainMessages() error = %v, want %v", err, wantErr)
	}

	if processed != 1 {
		t.Fatalf("processed = %d, want 1", processed)
	}
}

func TestDrainMessagesUntilStopsWhenContextExpires(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	messages := make(chan amqp.Delivery)

	err := drainMessagesUntil(
		ctx,
		messages,
		func(amqp.Delivery) error {
			return nil
		},
	)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf(
			"drainMessagesUntil() error = %v, want %v",
			err,
			context.Canceled,
		)
	}
}

func TestDrainMessagesUntilProcessesClosedChannel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	messages := make(chan amqp.Delivery)
	close(messages)

	err := drainMessagesUntil(
		ctx,
		messages,
		func(amqp.Delivery) error {
			return nil
		},
	)

	if err != nil {
		t.Fatalf("drainMessagesUntil() error = %v, want nil", err)
	}
}

func TestDrainMessagesUntilStopsAtDeadline(t *testing.T) {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		20*time.Millisecond,
	)
	defer cancel()

	messages := make(chan amqp.Delivery)

	err := drainMessagesUntil(
		ctx,
		messages,
		func(amqp.Delivery) error {
			return nil
		},
	)

	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf(
			"drainMessagesUntil() error = %v, want %v",
			err,
			context.DeadlineExceeded,
		)
	}
}

func TestDrainMessagesUntilReturnsHandlerError(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	wantErr := errors.New("handler failed")

	messages := make(chan amqp.Delivery, 1)
	messages <- amqp.Delivery{}

	err := drainMessagesUntil(
		ctx,
		messages,
		func(amqp.Delivery) error {
			return wantErr
		},
	)

	if !errors.Is(err, wantErr) {
		t.Fatalf(
			"drainMessagesUntil() error = %v, want %v",
			err,
			wantErr,
		)
	}
}

func TestRunConsumerReturnsChannelClosedError(t *testing.T) {
	ctx := context.Background()

	messages := make(chan amqp.Delivery)
	close(messages)

	err := runConsumer(
		ctx,
		messages,
		func() error {
			return nil
		},
		func(amqp.Delivery, context.Context) error {
			return nil
		},
	)

	if !errors.Is(err, errConsumerChannelClosed) {
		t.Fatalf(
			"runConsumer() error = %v, want %v",
			err,
			errConsumerChannelClosed,
		)
	}
}

func TestRunConsumerReturnsHandlerError(t *testing.T) {
	ctx := context.Background()
	wantErr := errors.New("handler failed")

	messages := make(chan amqp.Delivery, 1)
	messages <- amqp.Delivery{}

	err := runConsumer(
		ctx,
		messages,
		func() error {
			return nil
		},
		func(amqp.Delivery, context.Context) error {
			return wantErr
		},
	)

	if !errors.Is(err, wantErr) {
		t.Fatalf("runConsumer() error = %v, want %v", err, wantErr)
	}
}

func TestRunConsumerReturnsCancelError(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	messages := make(chan amqp.Delivery)
	cancelErr := errors.New("consumer cancel failed")

	err := runConsumer(
		ctx,
		messages,
		func() error {
			return cancelErr
		},
		func(amqp.Delivery, context.Context) error {
			return nil
		},
	)

	if !errors.Is(err, cancelErr) {
		t.Fatalf("runConsumer() error = %v, want %v", err, cancelErr)
	}
}

func TestRunConsumerDrainsPendingMessagesOnShutdown(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	messages := make(chan amqp.Delivery, 1)
	messages <- amqp.Delivery{}

	processed := 0

	err := runConsumer(
		ctx,
		messages,
		func() error {
			messages <- amqp.Delivery{}
			close(messages)
			return nil
		},
		func(amqp.Delivery, context.Context) error {
			processed++
			if processed == 1 {
				cancel()
			}
			return nil
		},
	)

	if err != nil {
		t.Fatalf("runConsumer() error = %v, want nil", err)
	}

	if processed != 2 {
		t.Fatalf("processed = %d, want 2", processed)
	}
}

func TestRunConsumerReturnsErrorWhenPendingDeliveryFailsDuringShutdown(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	messages := make(chan amqp.Delivery, 1)
	messages <- amqp.Delivery{}

	wantErr := errors.New("pending delivery failed")
	processed := 0

	err := runConsumer(
		ctx,
		messages,
		func() error {
			messages <- amqp.Delivery{}
			close(messages)
			return nil
		},
		func(amqp.Delivery, context.Context) error {
			processed++
			if processed == 1 {
				cancel()
				return nil
			}
			return wantErr
		},
	)

	if !errors.Is(err, wantErr) {
		t.Fatalf("runConsumer() error = %v, want %v", err, wantErr)
	}
}

func TestRunConsumerProcessesDeliveryDuringShutdown(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	messages := make(chan amqp.Delivery, 1)
	messages <- amqp.Delivery{}

	processed := 0

	err := runConsumer(
		ctx,
		messages,
		func() error {
			close(messages)
			return nil
		},
		func(amqp.Delivery, context.Context) error {
			processed++
			cancel()
			return nil
		},
	)

	if err != nil {
		t.Fatalf("runConsumer() error = %v, want nil", err)
	}

	if processed != 1 {
		t.Fatalf("processed = %d, want 1", processed)
	}
}

func TestShutdownConsumerReturnsFirstDeliveryHandlerError(t *testing.T) {
	messages := make(chan amqp.Delivery)
	close(messages)

	wantErr := errors.New("delivery handler failed")
	first := amqp.Delivery{}
	processed := 0

	err := shutdownConsumer(
		messages,
		func() error {
			return nil
		},
		func(amqp.Delivery, context.Context) error {
			processed++
			return wantErr
		},
		&first,
	)

	if !errors.Is(err, wantErr) {
		t.Fatalf("shutdownConsumer() error = %v, want %v", err, wantErr)
	}

	if processed != 1 {
		t.Fatalf("processed = %d, want 1", processed)
	}
}

func TestRunConsumerContextCanceledWhileWaiting(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	messages := make(chan amqp.Delivery)
	cancelCalled := make(chan struct{})

	// Cancel after runConsumer has had time to start waiting.
	timer := time.AfterFunc(50*time.Millisecond, cancel)
	defer timer.Stop()

	err := runConsumer(
		ctx,
		messages,
		func() error {
			close(cancelCalled)
			close(messages)
			return nil
		},
		func(amqp.Delivery, context.Context) error {
			return nil
		},
	)

	if err != nil {
		t.Fatalf("runConsumer() error = %v, want nil", err)
	}

	select {
	case <-cancelCalled:
		// Consumer cancellation was invoked.
	default:
		t.Fatal("expected consumer cancellation during shutdown")
	}
}

func TestRunConsumerProcessesDeliverySuccessfully(t *testing.T) {
	ctx := context.Background()

	messages := make(chan amqp.Delivery, 1)
	messages <- amqp.Delivery{}
	close(messages)

	processed := 0

	err := runConsumer(
		ctx,
		messages,
		func() error {
			return nil
		},
		func(_ amqp.Delivery, jobCtx context.Context) error {
			processed++

			if jobCtx == nil {
				t.Error("handler received nil context")
			}
			if err := jobCtx.Err(); err != nil {
				t.Errorf("handler context unexpectedly canceled: %v", err)
			}

			return nil
		},
	)

	if !errors.Is(err, errConsumerChannelClosed) {
		t.Fatalf(
			"runConsumer() error = %v, want %v",
			err,
			errConsumerChannelClosed,
		)
	}

	if processed != 1 {
		t.Errorf("processed = %d, want 1", processed)
	}
}

type cancelOnSecondErrContext struct {
	context.Context
	errCalls int
}

func (c *cancelOnSecondErrContext) Err() error {
	c.errCalls++
	if c.errCalls == 1 {
		return nil
	}
	return context.Canceled
}

func TestRunConsumerClosedChannelDuringCancellation(t *testing.T) {
	ctx := &cancelOnSecondErrContext{
		Context: context.Background(),
	}

	messages := make(chan amqp.Delivery)
	close(messages)

	err := runConsumer(
		ctx,
		messages,
		func() error {
			return nil
		},
		func(amqp.Delivery, context.Context) error {
			t.Fatal("handler called unexpectedly")
			return nil
		},
	)

	if err != nil {
		t.Fatalf("runConsumer() error = %v, want nil", err)
	}
}

func TestRunConsumerPreservesDeliveryDuringCancellation(t *testing.T) {
	ctx := &cancelOnSecondErrContext{
		Context: context.Background(),
	}

	messages := make(chan amqp.Delivery, 1)
	messages <- amqp.Delivery{}
	close(messages)

	processed := 0

	err := runConsumer(
		ctx,
		messages,
		func() error {
			return nil
		},
		func(_ amqp.Delivery, _ context.Context) error {
			processed++
			return nil
		},
	)

	if err != nil {
		t.Fatalf("runConsumer() error = %v, want nil", err)
	}

	if processed != 1 {
		t.Fatalf("processed = %d, want 1", processed)
	}
}
