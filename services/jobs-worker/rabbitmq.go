// Package main contains rabbitmq logic for the Relay jobs worker.

package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

// rabbitMQChannel represents the RabbitMQ channel methods
// used by this worker. It allows us to use fake channels in tests.
type rabbitMQChannel interface {
	reliabilityTopologyChannel
	reliablePublisherChannel

	Close() error
	Qos(prefetchCount, prefetchSize int, global bool) error
	Consume(
		queue, consumer string,
		autoAck, exclusive, noLocal, noWait bool,
		args amqp.Table,
	) (<-chan amqp.Delivery, error)
	Cancel(consumer string, noWait bool) error
}

// rabbitMQConnection represents the RabbitMQ connection methods
// used by this worker.
type rabbitMQConnection interface {
	Channel() (rabbitMQChannel, error)
	Close() error
}

// rabbitMQDialFunc allows us to inject a connection dialer in tests.
type rabbitMQDialFunc func(string) (rabbitMQConnection, error)

// amqpConnection is the subset of the real AMQP connection
// used by the adapter.
type amqpConnection interface {
	Channel() (*amqp.Channel, error)
	Close() error
}

// amqpRabbitMQConnection adapts an AMQP connection to the
// interfaces used by the worker.
type amqpRabbitMQConnection struct {
	conn amqpConnection
}

// Channel opens a real AMQP channel and returns it through the interface.
func (c *amqpRabbitMQConnection) Channel() (rabbitMQChannel, error) {
	ch, err := c.conn.Channel()
	if err != nil {
		return nil, err
	}

	return ch, nil
}

// Close closes the underlying AMQP connection.
func (c *amqpRabbitMQConnection) Close() error {
	return c.conn.Close()
}

// dialAMQPConnection establishes the underlying AMQP connection.
// This function is separate so tests can replace the dial operation.
var dialAMQPConnection = func(url string) (amqpConnection, error) {
	return amqp.Dial(url)
}

// dialRabbitMQ establishes a real RabbitMQ connection.
func dialRabbitMQ(url string) (rabbitMQConnection, error) {
	conn, err := dialAMQPConnection(url)
	if err != nil {
		return nil, err
	}

	return &amqpRabbitMQConnection{
		conn: conn,
	}, nil
}

// runRabbitMQSession owns one RabbitMQ connection and its channels.
// It returns when the consumer stops or the session fails.
func runRabbitMQSession(
	ctx context.Context,
	connectionURL string,
	processor *JobProcessor,
) error {
	return runRabbitMQSessionWithDialer(
		ctx,
		connectionURL,
		processor,
		dialRabbitMQ,
	)
}

// runRabbitMQSessionWithDialer runs a RabbitMQ session using the
// supplied dialer. Injecting a dialer makes connection failures testable.
func runRabbitMQSessionWithDialer(
	ctx context.Context,
	connectionURL string,
	processor *JobProcessor,
	dial rabbitMQDialFunc,
) error {
	conn, err := dial(connectionURL)
	if err != nil {
		return fmt.Errorf("connect to RabbitMQ: %w", err)
	}

	defer func() {
		if err := conn.Close(); err != nil {
			log.Printf("close RabbitMQ connection: %v", err)
		}
	}()

	// Open the consumer channel.
	ch, err := conn.Channel()
	if err != nil {
		return fmt.Errorf("open consumer channel: %w", err)
	}

	defer func() {
		if err := ch.Close(); err != nil {
			log.Printf("close consumer channel: %v", err)
		}
	}()

	// Declare the main job queue.
	queue, err := ch.QueueDeclare(
		mainQueue,
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return fmt.Errorf("declare main queue: %w", err)
	}

	// Declare dead-letter and retry queues.
	if err := declareReliabilityTopologyWithChannel(ch); err != nil {
		return fmt.Errorf("declare reliability queues: %w", err)
	}

	// Open a separate channel for reliable publishing.
	pubCh, err := conn.Channel()
	if err != nil {
		return fmt.Errorf("open publisher channel: %w", err)
	}

	defer func() {
		if err := pubCh.Close(); err != nil {
			log.Printf("close publisher channel: %v", err)
		}
	}()

	// Initialize publisher confirmations.
	publisher, err := newReliablePublisherWithChannel(pubCh)
	if err != nil {
		return fmt.Errorf("initialize reliable publisher: %w", err)
	}

	// Process one unacknowledged job at a time.
	if err := ch.Qos(1, 0, false); err != nil {
		return fmt.Errorf("configure prefetch: %w", err)
	}

	// Start consuming jobs.
	messages, err := ch.Consume(
		queue.Name,
		consumerTag,
		false,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return fmt.Errorf("start consumer: %w", err)
	}

	// Route each delivery through the existing message handler.
	handle := func(
		message amqp.Delivery,
		handleCtx context.Context,
	) error {
		return handleMessageContext(
			handleCtx,
			message,
			publisher,
			processor,
		)
	}

	log.Println("Go worker connected; waiting for jobs...")

	// Keep the worker heartbeat alive for the duration of the consumer session.
	// Tests with a nil processor do not have a Redis client, so they retain
	// their existing lifecycle without starting a heartbeat.
	sessionCtx, cancelSession := context.WithCancel(ctx)
	defer cancelSession()

	var heartbeatErrors chan error
	var heartbeatDone chan struct{}

	if processor != nil && processor.client != nil {
		heartbeatErrors = make(chan error, 1)
		heartbeatDone = make(chan struct{})

		go func() {
			defer close(heartbeatDone)
			if heartbeatErr := runWorkerHeartbeatForSession(
				sessionCtx,
				processor.client,
				workerHeartbeatInterval,
			); heartbeatErr != nil && !errors.Is(heartbeatErr, context.Canceled) {
				heartbeatErrors <- heartbeatErr
				cancelSession()
			}
		}()

		defer func() {
			// The TTL is a fallback; remove the key promptly on session exit.
			cleanupCtx, cleanupCancel := context.WithTimeout(
				context.Background(),
				time.Second,
			)
			defer cleanupCancel()

			if cleanupErr := processor.client.Del(
				cleanupCtx,
				workerHeartbeatKey,
			).Err(); cleanupErr != nil {
				log.Printf("remove worker heartbeat: %v", cleanupErr)
			}
		}()
	}

	// Run the consumer until shutdown, a delivery failure, or heartbeat failure.
	err = runConsumer(
		sessionCtx,
		messages,
		func() error {
			return ch.Cancel(consumerTag, false)
		},
		handle,
	)

	cancelSession()
	if heartbeatDone != nil {
		<-heartbeatDone
		select {
		case heartbeatErr := <-heartbeatErrors:
			return fmt.Errorf("worker heartbeat: %w", heartbeatErr)
		default:
		}
	}

	if err != nil {
		return fmt.Errorf("run consumer: %w", err)
	}

	return nil
}
