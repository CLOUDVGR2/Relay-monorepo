// Package main contains reliability logic for the Relay jobs worker.

package main

import (
	"context"
	"fmt"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	mainQueue = "go.jobs"
	deadQueue = "go.jobs.dlq"

	// maxAttempts includes the initial processing attempt.
	maxAttempts = 5
)

var retryDelays = []time.Duration{
	5 * time.Second,
	30 * time.Second,
	2 * time.Minute,
	5 * time.Minute,
}

func retryQueueName(delay time.Duration) string {
	return fmt.Sprintf("go.jobs.retry.%ds", int(delay.Seconds()))
}

type reliabilityTopologyChannel interface {
	QueueDeclare(
		name string,
		durable bool,
		autoDelete bool,
		exclusive bool,
		noWait bool,
		args amqp.Table,
	) (amqp.Queue, error)
}

func declareReliabilityTopology(
	ch reliabilityTopologyChannel,
) error {
	return declareReliabilityTopologyWithChannel(ch)
}

func declareReliabilityTopologyWithChannel(
	ch reliabilityTopologyChannel,
) error {
	_, err := ch.QueueDeclare(
		deadQueue,
		true, false, false, false,
		nil,
	)
	if err != nil {
		return fmt.Errorf("declare dead-letter queue: %w", err)
	}

	for _, delay := range retryDelays {
		_, err := ch.QueueDeclare(
			retryQueueName(delay),
			true, false, false, false,
			amqp.Table{
				"x-message-ttl":             int32(delay.Milliseconds()),
				"x-dead-letter-exchange":    "",
				"x-dead-letter-routing-key": mainQueue,
			},
		)
		if err != nil {
			return fmt.Errorf(
				"declare retry queue for %s: %w",
				delay,
				err,
			)
		}
	}

	return nil
}

// reliablePublisherChannel allows the publisher to use either a real
// RabbitMQ channel or a fake channel in unit tests.
type reliablePublisherChannel interface {
	Confirm(noWait bool) error
	NotifyPublish(
		confirm chan amqp.Confirmation,
	) chan amqp.Confirmation
	NotifyReturn(
		receiver chan amqp.Return,
	) chan amqp.Return
	PublishWithContext(
		ctx context.Context,
		exchange string,
		key string,
		mandatory bool,
		immediate bool,
		msg amqp.Publishing,
	) error
}

// reliablePublisher enables publisher confirms and detects returned messages.
//
// IMPORTANT: Use sequentially on one channel. After any publish error,
// the publisher becomes unusable and must not be reused.
type reliablePublisher struct {
	ch       reliablePublisherChannel
	confirms chan amqp.Confirmation
	returns  chan amqp.Return
	failed   error
}

// newReliablePublisher preserves the production constructor while allowing
// interface-based test doubles.
func newReliablePublisher(
	ch reliablePublisherChannel,
) (*reliablePublisher, error) {
	return newReliablePublisherWithChannel(ch)
}

// newReliablePublisherWithChannel also accepts fake channels for unit tests.
func newReliablePublisherWithChannel(
	ch reliablePublisherChannel,
) (*reliablePublisher, error) {
	if err := ch.Confirm(false); err != nil {
		return nil, fmt.Errorf("enable publisher confirms: %w", err)
	}

	return &reliablePublisher{
		ch:       ch,
		confirms: ch.NotifyPublish(make(chan amqp.Confirmation, 1)),
		returns:  ch.NotifyReturn(make(chan amqp.Return, 1)),
	}, nil
}

func (p *reliablePublisher) publish(
	ctx context.Context,
	queue string,
	body []byte,
	headers amqp.Table,
) error {
	if p.failed != nil {
		return fmt.Errorf(
			"publisher is unusable after a previous failure: %w",
			p.failed,
		)
	}

	fail := func(err error) error {
		p.failed = err
		return err
	}

	if err := p.ch.PublishWithContext(
		ctx,
		"", // Default exchange routes directly to a queue by name.
		queue,
		true, // Return messages that cannot be routed.
		false,
		amqp.Publishing{
			Headers:      headers,
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Timestamp:    time.Now(),
			Body:         body,
		},
	); err != nil {
		return fail(fmt.Errorf("publish to %s: %w", queue, err))
	}

	select {
	case confirmation, ok := <-p.confirms:
		if !ok {
			return fail(fmt.Errorf(
				"publisher confirmation channel closed",
			))
		}

		if !confirmation.Ack {
			return fail(fmt.Errorf(
				"RabbitMQ negatively acknowledged publish to %s",
				queue,
			))
		}

	case <-ctx.Done():
		return fail(fmt.Errorf(
			"waiting for publish confirmation: %w",
			ctx.Err(),
		))
	}

	// Mandatory returns are sent before the corresponding publisher
	// confirmation. This check relies on sequential publishing.
	select {
	case returned, ok := <-p.returns:
		if !ok {
			return fail(fmt.Errorf(
				"publisher return channel closed",
			))
		}

		return fail(fmt.Errorf(
			"message returned as unroutable (reply code %d): %s",
			returned.ReplyCode,
			returned.ReplyText,
		))

	default:
	}

	return nil
}

// retryDecision selects a retry queue or the dead-letter queue.
//
// attempt counts retries already scheduled, not the current attempt number.
// For example, attempt == 0 means the initial processing attempt failed.
func retryDecision(
	attempt int,
) (
	queue string,
	nextAttempt int,
	delay time.Duration,
	deadLetter bool,
) {
	// Treat a negative attempt count as zero.
	if attempt < 0 {
		attempt = 0
	}

	// maxAttempts includes the initial attempt.
	if attempt >= maxAttempts-1 {
		return deadQueue, attempt, 0, true
	}

	delay = retryDelays[attempt]
	nextAttempt = attempt + 1

	return retryQueueName(delay), nextAttempt, delay, false
}
