// Package main contains tests for reliability integration test in the Relay jobs worker.

package main

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

func TestPublisherDetectsUnroutableMessage(t *testing.T) {
	if os.Getenv("RABBITMQ_INTEGRATION") != "1" {
		t.Skip("set RABBITMQ_INTEGRATION=1 to run this integration test")
	}

	host := os.Getenv("RABBITMQ_HOST")
	if host == "" {
		host = "localhost:5672"
	}

	user := os.Getenv("RABBITMQ_DEFAULT_USER")
	pass := os.Getenv("RABBITMQ_DEFAULT_PASS")
	if user == "" || pass == "" {
		t.Fatal("RABBITMQ_DEFAULT_USER and RABBITMQ_DEFAULT_PASS must be set")
	}

	connectionURL := url.URL{
		Scheme: "amqp",
		User:   url.UserPassword(user, pass),
		Host:   host,
	}

	conn, err := amqp.Dial(connectionURL.String())
	if err != nil {
		t.Fatalf("connect to RabbitMQ: %v", err)
	}
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		t.Fatalf("open channel: %v", err)
	}
	defer ch.Close()

	publisher, err := newReliablePublisher(ch)
	if err != nil {
		t.Fatalf("create reliable publisher: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	missingQueue := fmt.Sprintf(
		"go.jobs.missing.integration.%d",
		time.Now().UnixNano(),
	)

	err = publisher.publish(
		ctx,
		missingQueue,
		[]byte(`{"test":"unroutable"}`),
		nil,
	)

	if err == nil {
		t.Fatal("expected an error when publishing to a nonexistent queue")
	}

	if !strings.Contains(err.Error(), "unroutable") {
		t.Fatalf("expected an unroutable-message error, got: %v", err)
	}

	t.Logf("Correctly detected unroutable message: %v", err)
}

func TestRabbitMQRedeliversUnackedMessage(t *testing.T) {
	if os.Getenv("RABBITMQ_INTEGRATION") != "1" {
		t.Skip("set RABBITMQ_INTEGRATION=1 to run this integration test")
	}

	host := os.Getenv("RABBITMQ_HOST")
	if host == "" {
		host = "localhost:5672"
	}

	user := os.Getenv("RABBITMQ_DEFAULT_USER")
	pass := os.Getenv("RABBITMQ_DEFAULT_PASS")
	if user == "" || pass == "" {
		t.Fatal("RABBITMQ_DEFAULT_USER and RABBITMQ_DEFAULT_PASS must be set")
	}

	connectionURL := url.URL{
		Scheme: "amqp",
		User:   url.UserPassword(user, pass),
		Host:   host,
	}

	conn, err := amqp.Dial(connectionURL.String())
	if err != nil {
		t.Fatalf("connect to RabbitMQ: %v", err)
	}
	defer conn.Close()

	queueName := fmt.Sprintf(
		"go.jobs.redelivery.integration.%d",
		time.Now().UnixNano(),
	)

	setupCh, err := conn.Channel()
	if err != nil {
		t.Fatalf("open setup channel: %v", err)
	}

	_, err = setupCh.QueueDeclare(
		queueName,
		false, // Not durable.
		false, // Not auto-delete.
		true,  // Exclusive to this connection.
		false,
		nil,
	)
	if err != nil {
		_ = setupCh.Close()
		t.Fatalf("declare test queue: %v", err)
	}

	defer func() {
		_, _ = setupCh.QueueDelete(queueName, false, false, false)
		_ = setupCh.Close()
	}()

	body := []byte(
		`{"id":"redelivery-test","type":"welcome","message":"hello"}`,
	)

	publishCtx, cancelPublish := context.WithTimeout(
		context.Background(),
		5*time.Second,
	)

	err = setupCh.PublishWithContext(
		publishCtx,
		"",
		queueName,
		true,
		false,
		amqp.Publishing{
			ContentType: "application/json",
			Body:        body,
		},
	)
	cancelPublish()

	if err != nil {
		t.Fatalf("publish test message: %v", err)
	}

	consumerCh, err := conn.Channel()
	if err != nil {
		t.Fatalf("open consumer channel: %v", err)
	}

	deliveries, err := consumerCh.Consume(
		queueName,
		"",
		false, // Manual acknowledgements.
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		_ = consumerCh.Close()
		t.Fatalf("consume test queue: %v", err)
	}

	select {
	case delivery, ok := <-deliveries:
		if !ok {
			_ = consumerCh.Close()
			t.Fatal("delivery channel closed before receiving message")
		}

		if string(delivery.Body) != string(body) {
			_ = consumerCh.Close()
			t.Fatalf(
				"received body %q, want %q",
				delivery.Body,
				body,
			)
		}

	case <-time.After(5 * time.Second):
		_ = consumerCh.Close()
		t.Fatal("timed out waiting for original message")
	}

	// The message remains unacknowledged. Closing the consumer channel
	// causes RabbitMQ to requeue its outstanding delivery.
	if err := consumerCh.Close(); err != nil {
		t.Fatalf("close consumer channel: %v", err)
	}

	recoveryCh, err := conn.Channel()
	if err != nil {
		t.Fatalf("open recovery channel: %v", err)
	}
	defer recoveryCh.Close()

	recovered, err := recoveryCh.Consume(
		queueName,
		"",
		false, // Leave the recovered message unacknowledged as well.
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		t.Fatalf("consume redelivered message: %v", err)
	}

	select {
	case delivery, ok := <-recovered:
		if !ok {
			t.Fatal("recovery delivery channel closed")
		}

		if !delivery.Redelivered {
			t.Fatal("expected RabbitMQ to mark the message as redelivered")
		}

		if string(delivery.Body) != string(body) {
			t.Fatalf(
				"redelivered body %q, want %q",
				delivery.Body,
				body,
			)
		}

		t.Log("RabbitMQ successfully redelivered the unacknowledged message")

	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for redelivered message")
	}
}

func TestRabbitMQRedeliversWhenRetryPublishFails(t *testing.T) {
	if os.Getenv("RABBITMQ_INTEGRATION") != "1" {
		t.Skip("set RABBITMQ_INTEGRATION=1 to run this integration test")
	}

	host := os.Getenv("RABBITMQ_HOST")
	if host == "" {
		host = "localhost:5672"
	}

	user := os.Getenv("RABBITMQ_DEFAULT_USER")
	pass := os.Getenv("RABBITMQ_DEFAULT_PASS")
	if user == "" || pass == "" {
		t.Fatal("RABBITMQ_DEFAULT_USER and RABBITMQ_DEFAULT_PASS must be set")
	}

	connectionURL := url.URL{
		Scheme: "amqp",
		User:   url.UserPassword(user, pass),
		Host:   host,
	}

	conn, err := amqp.Dial(connectionURL.String())
	if err != nil {
		t.Fatalf("connect to RabbitMQ: %v", err)
	}
	defer conn.Close()

	queueName := fmt.Sprintf(
		"go.jobs.handler-redelivery.integration.%d",
		time.Now().UnixNano(),
	)

	setupCh, err := conn.Channel()
	if err != nil {
		t.Fatalf("open setup channel: %v", err)
	}

	_, err = setupCh.QueueDeclare(
		queueName,
		false,
		false,
		true,
		false,
		nil,
	)
	if err != nil {
		_ = setupCh.Close()
		t.Fatalf("declare test queue: %v", err)
	}
	defer func() {
		_ = setupCh.Close()
	}()

	body := []byte(
		`{"id":"retry-failure-test","type":"welcome","message":"Hello"}`,
	)

	publishCtx, cancelPublish := context.WithTimeout(
		context.Background(),
		5*time.Second,
	)
	err = setupCh.PublishWithContext(
		publishCtx,
		"",
		queueName,
		true,
		false,
		amqp.Publishing{
			ContentType: "application/json",
			Body:        body,
		},
	)
	cancelPublish()
	if err != nil {
		t.Fatalf("publish test message: %v", err)
	}

	consumerCh, err := conn.Channel()
	if err != nil {
		t.Fatalf("open consumer channel: %v", err)
	}

	deliveries, err := consumerCh.Consume(
		queueName,
		"",
		false, // Manual acknowledgements.
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		_ = consumerCh.Close()
		t.Fatalf("consume test queue: %v", err)
	}

	var original amqp.Delivery
	select {
	case delivery, ok := <-deliveries:
		if !ok {
			_ = consumerCh.Close()
			t.Fatal("delivery channel closed before receiving message")
		}
		original = delivery
	case <-time.After(5 * time.Second):
		_ = consumerCh.Close()
		t.Fatal("timed out waiting for original message")
	}

	if string(original.Body) != string(body) {
		_ = consumerCh.Close()
		t.Fatalf("received body %q, want %q", original.Body, body)
	}

	publisher := &failingTestPublisher{
		err: errors.New("simulated retry publish failure"),
	}

	// A nil Redis client makes processing fail so handleMessage attempts
	// to publish the job to its retry queue.
	handlerErr := handleMessage(original, publisher, &JobProcessor{})
	if handlerErr == nil {
		_ = consumerCh.Close()
		t.Fatal("expected handler error when retry publishing fails")
	}

	if publisher.queue != retryQueueName(retryDelays[0]) {
		_ = consumerCh.Close()
		t.Fatalf(
			"retry queue %q, want %q",
			publisher.queue,
			retryQueueName(retryDelays[0]),
		)
	}

	// handleMessage returned an error without acknowledging the original.
	// Closing the channel causes RabbitMQ to requeue that delivery.
	if err := consumerCh.Close(); err != nil {
		t.Fatalf("close consumer channel: %v", err)
	}

	recoveryCh, err := conn.Channel()
	if err != nil {
		t.Fatalf("open recovery channel: %v", err)
	}
	defer recoveryCh.Close()

	recovered, err := recoveryCh.Consume(
		queueName,
		"",
		false,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		t.Fatalf("consume redelivered message: %v", err)
	}

	select {
	case delivery, ok := <-recovered:
		if !ok {
			t.Fatal("recovery delivery channel closed")
		}
		if !delivery.Redelivered {
			t.Fatal("expected RabbitMQ to mark the message as redelivered")
		}
		if string(delivery.Body) != string(body) {
			t.Fatalf(
				"redelivered body %q, want %q",
				delivery.Body,
				body,
			)
		}

		t.Log("RabbitMQ redelivered the original after retry publishing failed")
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for redelivered message")
	}
}

func TestRabbitMQRetryQueueReturnsMessageToMainQueue(t *testing.T) {
	if os.Getenv("RABBITMQ_INTEGRATION") != "1" {
		t.Skip("set RABBITMQ_INTEGRATION=1 to run this integration test")
	}

	host := os.Getenv("RABBITMQ_HOST")
	if host == "" {
		host = "localhost:5672"
	}

	user := os.Getenv("RABBITMQ_DEFAULT_USER")
	pass := os.Getenv("RABBITMQ_DEFAULT_PASS")
	if user == "" || pass == "" {
		t.Fatal("RABBITMQ_DEFAULT_USER and RABBITMQ_DEFAULT_PASS must be set")
	}

	connectionURL := url.URL{
		Scheme: "amqp",
		User:   url.UserPassword(user, pass),
		Host:   host,
	}

	conn, err := amqp.Dial(connectionURL.String())
	if err != nil {
		t.Fatalf("connect to RabbitMQ: %v", err)
	}
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		t.Fatalf("open channel: %v", err)
	}
	defer ch.Close()

	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	testMainQueue := "go.jobs.ttl-test.main." + suffix
	testRetryQueue := "go.jobs.ttl-test.retry." + suffix

	_, err = ch.QueueDeclare(
		testMainQueue,
		false, false, true, false, nil,
	)
	if err != nil {
		t.Fatalf("declare temporary main queue: %v", err)
	}

	_, err = ch.QueueDeclare(
		testRetryQueue,
		false, false, true, false,
		amqp.Table{
			"x-message-ttl":             int32(retryDelays[0].Milliseconds()),
			"x-dead-letter-exchange":    "",
			"x-dead-letter-routing-key": testMainQueue,
		},
	)
	if err != nil {
		t.Fatalf("declare temporary retry queue: %v", err)
	}

	deliveries, err := ch.Consume(
		testMainQueue,
		"",
		true, // Automatically acknowledge this test message.
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		t.Fatalf("consume temporary main queue: %v", err)
	}

	body := []byte(`{"id":"ttl-retry-integration","type":"welcome","message":"hello"}`)

	publishCtx, cancelPublish := context.WithTimeout(
		context.Background(),
		5*time.Second,
	)
	defer cancelPublish()

	err = ch.PublishWithContext(
		publishCtx,
		"",
		testRetryQueue,
		true,
		false,
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Body:         body,
		},
	)
	if err != nil {
		t.Fatalf("publish to temporary retry queue: %v", err)
	}

	timeout := time.NewTimer(retryDelays[0] + 5*time.Second)
	defer timeout.Stop()

	select {
	case delivery, ok := <-deliveries:
		if !ok {
			t.Fatal("consumer channel closed before receiving retried message")
		}
		if string(delivery.Body) != string(body) {
			t.Fatalf("received body %q, want %q", delivery.Body, body)
		}
		t.Log("RabbitMQ returned the message to the main queue after the retry TTL")

	case <-timeout.C:
		t.Fatal("timed out waiting for TTL-based dead-letter routing")
	}
}

func TestRabbitMQDeadLetterQueueReceivesMessage(t *testing.T) {
	if os.Getenv("RABBITMQ_INTEGRATION") != "1" {
		t.Skip("set RABBITMQ_INTEGRATION=1 to run this integration test")
	}

	host := os.Getenv("RABBITMQ_HOST")
	if host == "" {
		host = "localhost:5672"
	}

	user := os.Getenv("RABBITMQ_DEFAULT_USER")
	pass := os.Getenv("RABBITMQ_DEFAULT_PASS")
	if user == "" || pass == "" {
		t.Fatal("RABBITMQ_DEFAULT_USER and RABBITMQ_DEFAULT_PASS must be set")
	}

	connectionURL := url.URL{
		Scheme: "amqp",
		User:   url.UserPassword(user, pass),
		Host:   host,
	}

	conn, err := amqp.Dial(connectionURL.String())
	if err != nil {
		t.Fatalf("connect to RabbitMQ: %v", err)
	}
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		t.Fatalf("open channel: %v", err)
	}
	defer ch.Close()

	testQueue := fmt.Sprintf("go.jobs.dlq.integration.%d", time.Now().UnixNano())

	_, err = ch.QueueDeclare(
		testQueue,
		false, false, true, false, nil,
	)
	if err != nil {
		t.Fatalf("declare temporary dead-letter test queue: %v", err)
	}

	body := []byte(`{"id":"dlq-integration-test","type":"welcome","message":"hello"}`)
	headers := amqp.Table{
		reasonHeader:  "maximum attempts exceeded",
		attemptHeader: int32(4),
		errorHeader:   "simulated processing failure",
	}

	if err := ch.PublishWithContext(
		context.Background(),
		"",
		testQueue,
		true,
		false,
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Headers:      headers,
			Body:         body,
		},
	); err != nil {
		t.Fatalf("publish test dead-letter message: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	deliveries, err := ch.Consume(
		testQueue,
		"",
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		t.Fatalf("consume test dead-letter queue: %v", err)
	}

	select {
	case delivery, ok := <-deliveries:
		if !ok {
			t.Fatal("consumer channel closed before receiving dead-letter message")
		}

		if string(delivery.Body) != string(body) {
			t.Fatalf("received body %q, want %q", delivery.Body, body)
		}

		if got := delivery.Headers[reasonHeader]; got != headers[reasonHeader] {
			t.Fatalf("DLQ reason = %v, want %v", got, headers[reasonHeader])
		}

		if got := delivery.Headers[attemptHeader]; got != headers[attemptHeader] {
			t.Fatalf("attempt header = %v, want %v", got, headers[attemptHeader])
		}

		if got := delivery.Headers[errorHeader]; got != headers[errorHeader] {
			t.Fatalf("error header = %v, want %v", got, headers[errorHeader])
		}

		t.Log("RabbitMQ delivered the dead-letter message with its headers intact")

	case <-ctx.Done():
		t.Fatal("timed out waiting for dead-letter message")
	}
}

type redirectDeadLetterPublisher struct {
	publisher *reliablePublisher
	testQueue string
}

func (p *redirectDeadLetterPublisher) publish(
	ctx context.Context,
	queue string,
	body []byte,
	headers amqp.Table,
) error {
	if queue == deadQueue {
		queue = p.testQueue
	}

	return p.publisher.publish(ctx, queue, body, headers)
}

func TestRabbitMQHandlerPublishesInvalidJSONToDeadLetterQueue(t *testing.T) {
	if os.Getenv("RABBITMQ_INTEGRATION") != "1" {
		t.Skip("set RABBITMQ_INTEGRATION=1 to run this integration test")
	}

	host := os.Getenv("RABBITMQ_HOST")
	if host == "" {
		host = "localhost:5672"
	}

	user := os.Getenv("RABBITMQ_DEFAULT_USER")
	pass := os.Getenv("RABBITMQ_DEFAULT_PASS")
	if user == "" || pass == "" {
		t.Fatal("RABBITMQ_DEFAULT_USER and RABBITMQ_DEFAULT_PASS must be set")
	}

	connectionURL := url.URL{
		Scheme: "amqp",
		User:   url.UserPassword(user, pass),
		Host:   host,
	}

	conn, err := amqp.Dial(connectionURL.String())
	if err != nil {
		t.Fatalf("dial RabbitMQ: %v", err)
	}
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		t.Fatalf("open RabbitMQ channel: %v", err)
	}
	defer ch.Close()

	testQueue := fmt.Sprintf(
		"go.jobs.dlq.handler.integration.%d",
		time.Now().UnixNano(),
	)

	_, err = ch.QueueDeclare(testQueue, false, false, true, false, nil)
	if err != nil {
		t.Fatalf("declare test queue: %v", err)
	}

	publisher, err := newReliablePublisher(ch)
	if err != nil {
		t.Fatalf("create reliable publisher: %v", err)
	}

	redirectedPublisher := &redirectDeadLetterPublisher{
		publisher: publisher,
		testQueue: testQueue,
	}

	acker := &reliabilityTestAcknowledger{}
	message := amqp.Delivery{
		Acknowledger: acker,
		Body:         []byte("{invalid JSON"),
	}

	if err := handleMessage(message, redirectedPublisher, &JobProcessor{}); err != nil {
		t.Fatalf("handle invalid JSON: %v", err)
	}

	if acker.ackCount != 1 {
		t.Fatalf("ack count = %d, want 1 after successful publish", acker.ackCount)
	}

	delivery, ok, err := ch.Get(testQueue, true)
	if err != nil {
		t.Fatalf("get dead-letter message: %v", err)
	}
	if !ok {
		t.Fatal("expected invalid JSON message in dead-letter queue")
	}

	if string(delivery.Body) != string(message.Body) {
		t.Fatalf("body = %q, want %q", delivery.Body, message.Body)
	}

	if got := delivery.Headers[reasonHeader]; got != "invalid JSON" {
		t.Fatalf("dead-letter reason = %v, want %q", got, "invalid JSON")
	}

	if got := delivery.Headers[errorHeader]; got == nil {
		t.Fatal("expected last-error header on dead-letter message")
	}

	t.Log("handler published invalid JSON to RabbitMQ before acknowledging it")
}

func TestDrainMessagesUntilReturnsNilWhenChannelCloses(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	messages := make(chan amqp.Delivery)
	close(messages)

	err := drainMessagesUntil(ctx, messages, func(amqp.Delivery) error {
		t.Fatal("handler should not run for a closed channel")
		return nil
	})

	if err != nil {
		t.Fatalf("drainMessagesUntil() error = %v, want nil", err)
	}
}

func TestDrainMessagesUntilReturnsContextDeadline(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	messages := make(chan amqp.Delivery)

	err := drainMessagesUntil(ctx, messages, func(amqp.Delivery) error {
		t.Fatal("handler should not run after context cancellation")
		return nil
	})

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("drainMessagesUntil() error = %v, want %v", err, context.Canceled)
	}
}
