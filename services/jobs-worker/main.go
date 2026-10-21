// Package main starts the Relay jobs worker application.

package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	redis "github.com/redis/go-redis/v9"
)

const (
	consumerTag     = "go-worker"
	shutdownTimeout = 30 * time.Second
)

var errConsumerChannelClosed = errors.New(
	"RabbitMQ delivery channel closed unexpectedly",
)

var (
	runWorkerEntrypointForMain = runWorkerEntrypoint
	fatalfForMain              = log.Fatalf
)

// main initializes Redis and starts the RabbitMQ reconnect loop.
func main() {
	if err := runWorkerEntrypointForMain(
		newRedisClient,
		rabbitMQURLFromEnv,
		runWorkerSessions,
	); err != nil {
		fatalfForMain("worker startup: %v", err)
	}
}

// runWorkerEntrypoint owns OS signal handling and worker startup.
func runWorkerEntrypoint(
	initializeRedis func(context.Context) (*redis.Client, error),
	getRabbitMQURL func() (string, error),
	startSessions func(context.Context, string, *JobProcessor),
) error {
	ctx, stop := signal.NotifyContext(
		context.Background(),
		os.Interrupt,
		syscall.SIGTERM,
	)
	defer stop()

	return runWorker(ctx, initializeRedis, getRabbitMQURL, startSessions)
}

// runWorker initializes dependencies and starts the worker.
// Dependencies are injected so startup can be tested without live services.
func runWorker(
	ctx context.Context,
	initializeRedis func(context.Context) (*redis.Client, error),
	getRabbitMQURL func() (string, error),
	startSessions func(context.Context, string, *JobProcessor),
) error {
	redisClient, err := initializeRedis(ctx)
	if err != nil {
		return fmt.Errorf("initialize Redis: %w", err)
	}

	defer closeRedisClient(redisClient.Close)

	processor := NewJobProcessor(redisClient)

	connectionURL, err := getRabbitMQURL()
	if err != nil {
		return fmt.Errorf("configure RabbitMQ: %w", err)
	}

	startSessions(ctx, connectionURL, processor)
	return nil
}

// closeRedisClient closes Redis and logs any error.
func closeRedisClient(closeClient func() error) {
	if err := closeClient(); err != nil {
		log.Printf("close Redis client: %v", err)
	}
}

// runWorkerSessions runs the RabbitMQ reconnect loop.
func runWorkerSessions(
	ctx context.Context,
	connectionURL string,
	processor *JobProcessor,
) {
	runWorkerSessionsWithDependencies(
		ctx,
		connectionURL,
		processor,
		runRabbitMQSession,
		waitForReconnectDelay,
	)
}

// runWorkerSessionsWithDependencies makes session execution and reconnect
// waiting injectable so the retry behavior can be tested without RabbitMQ.
func runWorkerSessionsWithDependencies(
	ctx context.Context,
	connectionURL string,
	processor *JobProcessor,
	runSession func(context.Context, string, *JobProcessor) error,
	wait func(context.Context, time.Duration) error,
) {
	err := runReconnectLoop(
		ctx,
		func(attemptCtx context.Context) (bool, error) {
			err := runSession(attemptCtx, connectionURL, processor)

			if attemptCtx.Err() != nil {
				return false, attemptCtx.Err()
			}

			if err == nil {
				return false, nil
			}

			log.Printf("RabbitMQ session failed: %v", err)
			return true, err
		},
		wait,
		initialReconnectDelay,
		maxReconnectDelay,
	)

	if err != nil && !errors.Is(err, context.Canceled) {
		log.Printf("worker stopped: %v", err)
	}
}

// shutdownConsumer stops the consumer and processes deliveries that
// have already arrived, subject to the shutdown deadline.
func shutdownConsumer(
	messages <-chan amqp.Delivery,
	cancelConsumer func() error,
	handle func(amqp.Delivery, context.Context) error,
	first *amqp.Delivery,
) error {
	log.Println("Shutdown signal received; stopping consumer...")

	// Stop the broker from sending additional deliveries.
	if err := cancelConsumer(); err != nil {
		return fmt.Errorf("cancel consumer: %w", err)
	}

	shutdownCtx, cancel := context.WithTimeout(
		context.Background(),
		shutdownTimeout,
	)
	defer cancel()

	// Handle a delivery received during the cancellation race.
	if first != nil {
		if err := handle(*first, shutdownCtx); err != nil {
			return fmt.Errorf("shutdown drain incomplete: %w", err)
		}
	}

	err := drainMessagesUntil(
		shutdownCtx,
		messages,
		func(message amqp.Delivery) error {
			return handle(message, shutdownCtx)
		},
	)
	if err != nil {
		return fmt.Errorf("shutdown drain incomplete: %w", err)
	}

	log.Println("Go worker shut down cleanly")
	return nil
}

// runConsumer processes deliveries until the context is canceled,
// the delivery channel closes, or handling fails.
func runConsumer(
	ctx context.Context,
	messages <-chan amqp.Delivery,
	cancelConsumer func() error,
	handle func(amqp.Delivery, context.Context) error,
) error {
	shutdown := func(first *amqp.Delivery) error {
		return shutdownConsumer(
			messages,
			cancelConsumer,
			handle,
			first,
		)
	}

	for {
		// Prefer shutdown when cancellation is already visible.
		if ctx.Err() != nil {
			return shutdown(nil)
		}

		select {
		case <-ctx.Done():
			return shutdown(nil)

		case message, ok := <-messages:
			if !ok {
				if ctx.Err() != nil {
					return shutdown(nil)
				}

				log.Println("RabbitMQ delivery channel closed")
				return errConsumerChannelClosed
			}

			// Preserve the delivery if cancellation races with
			// receiving a message.
			if ctx.Err() != nil {
				return shutdown(&message)
			}

			jobCtx, cancelJob := context.WithTimeout(
				context.Background(),
				shutdownTimeout,
			)

			err := handle(message, jobCtx)
			cancelJob()

			if err != nil {
				return fmt.Errorf(
					"delivery handling failed: %w",
					err,
				)
			}
		}
	}
}

// drainMessages processes deliveries until the channel closes
// or a handler fails.
func drainMessages(
	messages <-chan amqp.Delivery,
	handle func(amqp.Delivery) error,
) error {
	for message := range messages {
		if err := handle(message); err != nil {
			return err
		}
	}

	return nil
}

// drainMessagesUntil stops waiting when the channel closes,
// the shutdown deadline expires, or the handler returns an error.
func drainMessagesUntil(
	ctx context.Context,
	messages <-chan amqp.Delivery,
	handle func(amqp.Delivery) error,
) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()

		case message, ok := <-messages:
			if !ok {
				return nil
			}

			if err := handle(message); err != nil {
				return err
			}
		}
	}
}
