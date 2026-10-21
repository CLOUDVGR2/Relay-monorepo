// Package main contains tests for handler reliability test in the Relay jobs worker.

package main

import (
	"context"
	"errors"
	"net/url"
	"os"
	"testing"

	"github.com/alicebob/miniredis/v2"
	amqp "github.com/rabbitmq/amqp091-go"
	redis "github.com/redis/go-redis/v9"
)

type failingTestPublisher struct {
	queue string
	err   error
}

func (p *failingTestPublisher) publish(
	ctx context.Context,
	queue string,
	body []byte,
	headers amqp.Table,
) error {
	p.queue = queue
	return p.err
}

type testAcknowledger struct {
	ackCalls int
	ackErr   error
}

func (a *testAcknowledger) Ack(tag uint64, multiple bool) error {
	a.ackCalls++
	return a.ackErr
}

func (a *testAcknowledger) Nack(
	tag uint64,
	multiple bool,
	requeue bool,
) error {
	return nil
}

func (a *testAcknowledger) Reject(tag uint64, requeue bool) error {
	return nil
}

func TestHandleMessageDoesNotAckWhenRetryPublishFails(t *testing.T) {
	publishErr := errors.New("simulated retry publish failure")

	publisher := &failingTestPublisher{
		err: publishErr,
	}

	acknowledger := &testAcknowledger{}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body: []byte(
			`{"id":"job-123","type":"welcome","message":"Hello"}`,
		),
		Headers: amqp.Table{},
	}

	// A nil Redis client deliberately causes processing to fail.
	processor := &JobProcessor{}

	err := handleMessage(message, publisher, processor)

	if err == nil {
		t.Fatal("expected an error when retry publishing fails")
	}

	if !errors.Is(err, publishErr) {
		t.Fatalf("error = %v, want wrapped error %v", err, publishErr)
	}

	if publisher.queue != retryQueueName(retryDelays[0]) {
		t.Fatalf(
			"published to queue %q, want %q",
			publisher.queue,
			retryQueueName(retryDelays[0]),
		)
	}

	if acknowledger.ackCalls != 0 {
		t.Fatalf(
			"original message was acknowledged %d times; want 0",
			acknowledger.ackCalls,
		)
	}
}

func TestHandleMessageReturnsAckFailure(t *testing.T) {
	wantErr := errors.New("simulated acknowledgment failure")

	acknowledger := &testAcknowledger{
		ackErr: wantErr,
	}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body: []byte(
			`{"id":"job-ack-failure","type":"welcome","message":"Hello"}`,
		),
		Headers: amqp.Table{},
	}

	// A nil Redis client causes processing to fail, so the handler
	// publishes the job to the retry queue before attempting Ack.
	publisher := &failingTestPublisher{}
	processor := &JobProcessor{}

	err := handleMessage(message, publisher, processor)

	if err == nil {
		t.Fatal("expected acknowledgment error")
	}

	if !errors.Is(err, wantErr) {
		t.Fatalf("error = %v, want wrapped error %v", err, wantErr)
	}

	if acknowledger.ackCalls != 1 {
		t.Fatalf(
			"Ack calls = %d, want 1",
			acknowledger.ackCalls,
		)
	}

	if publisher.queue != retryQueueName(retryDelays[0]) {
		t.Fatalf(
			"published to queue %q, want %q",
			publisher.queue,
			retryQueueName(retryDelays[0]),
		)
	}
}

type timeoutTestPublisher struct {
	gotDeadline bool
	err         error
}

func (p *timeoutTestPublisher) publish(
	ctx context.Context,
	queue string,
	body []byte,
	headers amqp.Table,
) error {
	_, p.gotDeadline = ctx.Deadline()
	return p.err
}

type cancelingTestPublisher struct {
	queue  string
	cancel context.CancelFunc
}

func (p *cancelingTestPublisher) publish(
	ctx context.Context,
	queue string,
	body []byte,
	headers amqp.Table,
) error {
	p.queue = queue
	p.cancel()
	return nil
}

func TestPublishWithTimeoutProvidesDeadlineAndReturnsError(t *testing.T) {
	wantErr := errors.New("simulated publish failure")

	publisher := &timeoutTestPublisher{
		err: wantErr,
	}

	err := publishWithTimeout(
		publisher,
		"test-queue",
		[]byte("test message"),
		amqp.Table{},
	)

	if !publisher.gotDeadline {
		t.Fatal("publish context has no deadline")
	}

	if !errors.Is(err, wantErr) {
		t.Fatalf("publishWithTimeout() error = %v, want %v", err, wantErr)
	}
}

func TestDeclareReliabilityTopology(t *testing.T) {
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

	if err := declareReliabilityTopology(ch); err != nil {
		t.Fatalf("declare reliability topology: %v", err)
	}

	queueNames := []string{deadQueue}
	for _, delay := range retryDelays {
		queueNames = append(queueNames, retryQueueName(delay))
	}

	for _, name := range queueNames {
		t.Run(name, func(t *testing.T) {
			queue, err := ch.QueueInspect(name)
			if err != nil {
				t.Fatalf("inspect queue %q: %v", name, err)
			}

			if queue.Name != name {
				t.Errorf("queue name = %q, want %q", queue.Name, name)
			}
		})
	}
}

func TestHandleMessageInvalidJSONPublishFailure(t *testing.T) {
	publishErr := errors.New("simulated DLQ publish failure")
	publisher := &failingTestPublisher{err: publishErr}
	acknowledger := &testAcknowledger{}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body:         []byte(`{"invalid JSON`),
	}

	err := handleMessage(message, publisher, &JobProcessor{})

	if !errors.Is(err, publishErr) {
		t.Fatalf("error = %v, want wrapped error %v", err, publishErr)
	}
	if publisher.queue != deadQueue {
		t.Fatalf("published to %q, want %q", publisher.queue, deadQueue)
	}
	if acknowledger.ackCalls != 0 {
		t.Fatalf("Ack calls = %d, want 0", acknowledger.ackCalls)
	}
}

func TestHandleMessageInvalidJSONAckFailure(t *testing.T) {
	wantErr := errors.New("simulated acknowledgment failure")
	publisher := &failingTestPublisher{}
	acknowledger := &testAcknowledger{ackErr: wantErr}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body:         []byte(`{"invalid JSON`),
	}

	err := handleMessage(message, publisher, &JobProcessor{})

	if !errors.Is(err, wantErr) {
		t.Fatalf("error = %v, want wrapped error %v", err, wantErr)
	}
	if publisher.queue != deadQueue {
		t.Fatalf("published to %q, want %q", publisher.queue, deadQueue)
	}
	if acknowledger.ackCalls != 1 {
		t.Fatalf("Ack calls = %d, want 1", acknowledger.ackCalls)
	}
}

func TestHandleMessageExhaustedJobDLQPublishFailure(t *testing.T) {
	publishErr := errors.New("simulated exhausted-job DLQ failure")
	publisher := &failingTestPublisher{err: publishErr}
	acknowledger := &testAcknowledger{}

	// Find an attempt value that the current retry policy dead-letters.
	attempt := 0
	for {
		_, _, _, deadLetter := retryDecision(attempt)
		if deadLetter {
			break
		}
		attempt++
		if attempt > 100 {
			t.Fatal("retryDecision never selected dead-lettering")
		}
	}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body:         []byte(`{"id":"exhausted-job","type":"welcome","message":"Hello"}`),
		Headers:      amqp.Table{attemptHeader: int32(attempt)},
	}

	err := handleMessage(message, publisher, &JobProcessor{})

	if !errors.Is(err, publishErr) {
		t.Fatalf("error = %v, want wrapped error %v", err, publishErr)
	}
	if publisher.queue != deadQueue {
		t.Fatalf("published to %q, want %q", publisher.queue, deadQueue)
	}
	if acknowledger.ackCalls != 0 {
		t.Fatalf("Ack calls = %d, want 0", acknowledger.ackCalls)
	}
}

func TestHandleMessageExhaustedJobAckFailure(t *testing.T) {
	wantErr := errors.New("simulated exhausted-job acknowledgment failure")
	publisher := &failingTestPublisher{}
	acknowledger := &testAcknowledger{ackErr: wantErr}

	attempt := 0
	for {
		_, _, _, deadLetter := retryDecision(attempt)
		if deadLetter {
			break
		}
		attempt++
		if attempt > 100 {
			t.Fatal("retryDecision never selected dead-lettering")
		}
	}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body:         []byte(`{"id":"exhausted-job","type":"welcome","message":"Hello"}`),
		Headers:      amqp.Table{attemptHeader: int32(attempt)},
	}

	err := handleMessage(message, publisher, &JobProcessor{})

	if !errors.Is(err, wantErr) {
		t.Fatalf("error = %v, want wrapped error %v", err, wantErr)
	}
	if publisher.queue != deadQueue {
		t.Fatalf("published to %q, want %q", publisher.queue, deadQueue)
	}
	if acknowledger.ackCalls != 1 {
		t.Fatalf("Ack calls = %d, want 1", acknowledger.ackCalls)
	}
}

func TestHandleMessageContextAlreadyCanceled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	publisher := &failingTestPublisher{}
	acknowledger := &testAcknowledger{}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body:         []byte(`{"id":"canceled-job","type":"welcome","message":"Hello"}`),
	}

	err := handleMessageContext(ctx, message, publisher, &JobProcessor{})

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want %v", err, context.Canceled)
	}
	if publisher.queue != "" {
		t.Fatalf("publisher queue = %q, want no publish", publisher.queue)
	}
	if acknowledger.ackCalls != 0 {
		t.Fatalf("Ack calls = %d, want 0", acknowledger.ackCalls)
	}
}

func TestHandleMessageContextCanceledAfterRetryPublishDoesNotAck(
	t *testing.T,
) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	publisher := &cancelingTestPublisher{
		cancel: cancel,
	}
	acknowledger := &testAcknowledger{}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body: []byte(
			`{"id":"cancel-after-publish","type":"welcome","message":"Hello"}`,
		),
		Headers: amqp.Table{},
	}

	// A nil Redis client makes processing fail, triggering a retry publish.
	err := handleMessageContext(
		ctx,
		message,
		publisher,
		&JobProcessor{},
	)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want %v", err, context.Canceled)
	}

	wantQueue := retryQueueName(retryDelays[0])
	if publisher.queue != wantQueue {
		t.Fatalf("published to %q, want %q", publisher.queue, wantQueue)
	}

	if acknowledger.ackCalls != 0 {
		t.Fatalf(
			"Ack calls = %d, want 0 after cancellation",
			acknowledger.ackCalls,
		)
	}
}

func TestHandleMessageContextSuccess(t *testing.T) {
	server, err := miniredis.Run()
	if err != nil {
		t.Fatalf("start test Redis: %v", err)
	}
	t.Cleanup(server.Close)

	client := redis.NewClient(&redis.Options{
		Addr: server.Addr(),
	})
	t.Cleanup(func() {
		if err := client.Close(); err != nil {
			t.Errorf("close Redis client: %v", err)
		}
	})

	processor := NewJobProcessor(client)
	publisher := &failingTestPublisher{}
	acknowledger := &testAcknowledger{}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body:         []byte(`{"id":"job-success","type":"welcome","message":"Hello"}`),
		Headers:      amqp.Table{},
	}

	err = handleMessageContext(
		context.Background(),
		message,
		publisher,
		processor,
	)
	if err != nil {
		t.Fatalf("handleMessageContext() error = %v", err)
	}

	if acknowledger.ackCalls != 1 {
		t.Fatalf("Ack calls = %d, want 1", acknowledger.ackCalls)
	}

	if publisher.queue != "" {
		t.Fatalf("unexpected publish to queue %q", publisher.queue)
	}
}

func TestHandleMessageContextCanceledAfterInvalidJSONPublishDoesNotAck(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	publisher := &cancelingTestPublisher{
		cancel: cancel,
	}
	acknowledger := &testAcknowledger{}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body:         []byte(`{"id":`),
		Headers:      amqp.Table{},
	}

	err := handleMessageContext(
		ctx,
		message,
		publisher,
		&JobProcessor{},
	)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context.Canceled", err)
	}

	if publisher.queue != deadQueue {
		t.Fatalf(
			"published to queue %q, want %q",
			publisher.queue,
			deadQueue,
		)
	}

	if acknowledger.ackCalls != 0 {
		t.Fatalf("Ack calls = %d, want 0", acknowledger.ackCalls)
	}
}

func TestHandleMessageContextCanceledBeforeProcessing(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	acknowledger := &testAcknowledger{}
	publisher := &failingTestPublisher{}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body:         []byte(`{"id":"job-canceled","type":"welcome","message":"Hello"}`),
		Headers:      amqp.Table{},
	}

	err := handleMessageContext(
		ctx,
		message,
		publisher,
		&JobProcessor{},
	)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context.Canceled", err)
	}

	if acknowledger.ackCalls != 0 {
		t.Fatalf("Ack calls = %d, want 0", acknowledger.ackCalls)
	}

	if publisher.queue != "" {
		t.Fatalf("unexpected publish to queue %q", publisher.queue)
	}
}

func TestHandleMessageContextInvalidJSONPublishFails(t *testing.T) {
	wantErr := errors.New("dead-letter publish failed")

	publisher := &failingTestPublisher{err: wantErr}
	acknowledger := &testAcknowledger{}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body:         []byte(`{"id":`),
		Headers:      amqp.Table{},
	}

	err := handleMessageContext(
		context.Background(),
		message,
		publisher,
		&JobProcessor{},
	)

	if !errors.Is(err, wantErr) {
		t.Fatalf("error = %v, want wrapped error %v", err, wantErr)
	}

	if publisher.queue != deadQueue {
		t.Fatalf("published to queue %q, want %q", publisher.queue, deadQueue)
	}

	if acknowledger.ackCalls != 0 {
		t.Fatalf("Ack calls = %d, want 0", acknowledger.ackCalls)
	}
}

func TestHandleMessageContextDeadLettersExhaustedJob(t *testing.T) {
	publisher := &failingTestPublisher{}
	acknowledger := &testAcknowledger{}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body: []byte(
			`{"id":"job-exhausted","type":"welcome","message":"Hello"}`,
		),
		Headers: amqp.Table{
			attemptHeader: int32(maxAttempts - 1),
		},
	}

	// An uninitialized processor produces a processing error.
	// At the retry limit, that error should send the job to the DLQ.
	err := handleMessageContext(
		context.Background(),
		message,
		publisher,
		&JobProcessor{},
	)
	if err != nil {
		t.Fatalf("handleMessageContext() error = %v", err)
	}

	if publisher.queue != deadQueue {
		t.Fatalf("published to queue %q, want %q", publisher.queue, deadQueue)
	}

	if acknowledger.ackCalls != 1 {
		t.Fatalf("Ack calls = %d, want 1", acknowledger.ackCalls)
	}
}

func TestHandleMessageContextDuplicateJob(t *testing.T) {
	server, err := miniredis.Run()
	if err != nil {
		t.Fatalf("start test Redis: %v", err)
	}
	t.Cleanup(server.Close)

	client := redis.NewClient(&redis.Options{
		Addr: server.Addr(),
	})
	t.Cleanup(func() {
		if err := client.Close(); err != nil {
			t.Errorf("close Redis client: %v", err)
		}
	})

	processor := NewJobProcessor(client)
	publisher := &failingTestPublisher{}
	acknowledger := &testAcknowledger{}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body: []byte(
			`{"id":"job-duplicate-test","type":"welcome","message":"Hello"}`,
		),
		Headers: amqp.Table{},
	}

	// First delivery processes the job successfully.
	err = handleMessageContext(
		context.Background(),
		message,
		publisher,
		processor,
	)
	if err != nil {
		t.Fatalf("first handleMessageContext() error = %v", err)
	}

	if acknowledger.ackCalls != 1 {
		t.Fatalf("first delivery Ack calls = %d, want 1", acknowledger.ackCalls)
	}

	// Simulate RabbitMQ redelivering the same job.
	duplicateAcknowledger := &testAcknowledger{}
	duplicateMessage := amqp.Delivery{
		Acknowledger: duplicateAcknowledger,
		DeliveryTag:  2,
		Body:         message.Body,
		Headers:      amqp.Table{},
	}

	err = handleMessageContext(
		context.Background(),
		duplicateMessage,
		publisher,
		processor,
	)
	if err != nil {
		t.Fatalf("duplicate handleMessageContext() error = %v", err)
	}

	if duplicateAcknowledger.ackCalls != 1 {
		t.Fatalf(
			"duplicate delivery Ack calls = %d, want 1",
			duplicateAcknowledger.ackCalls,
		)
	}

	if publisher.queue != "" {
		t.Fatalf(
			"duplicate job unexpectedly published to queue %q",
			publisher.queue,
		)
	}
}

func TestHandleMessageContextInvalidJSONAckSuccess(t *testing.T) {
	acknowledger := &testAcknowledger{}
	publisher := &failingTestPublisher{}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body:         []byte(`{"id":`),
		Headers:      amqp.Table{},
	}

	err := handleMessageContext(
		context.Background(),
		message,
		publisher,
		&JobProcessor{},
	)
	if err != nil {
		t.Fatalf("handleMessageContext() error = %v", err)
	}
	if publisher.queue != deadQueue {
		t.Fatalf("published to %q, want %q", publisher.queue, deadQueue)
	}
	if acknowledger.ackCalls != 1 {
		t.Fatalf("Ack calls = %d, want 1", acknowledger.ackCalls)
	}
}

func TestHandleMessageContextDeadLetterAckFailure(t *testing.T) {
	wantErr := errors.New("dead-letter acknowledgment failed")
	acknowledger := &testAcknowledger{ackErr: wantErr}
	publisher := &failingTestPublisher{}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body:         []byte(`{"id":"job-dlq-ack-failure","type":"welcome","message":"Hello"}`),
		Headers: amqp.Table{
			attemptHeader: int32(maxAttempts - 1),
		},
	}

	err := handleMessageContext(
		context.Background(),
		message,
		publisher,
		&JobProcessor{},
	)
	if !errors.Is(err, wantErr) {
		t.Fatalf("error = %v, want %v", err, wantErr)
	}
	if publisher.queue != deadQueue {
		t.Fatalf("published to %q, want %q", publisher.queue, deadQueue)
	}
	if acknowledger.ackCalls != 1 {
		t.Fatalf("Ack calls = %d, want 1", acknowledger.ackCalls)
	}
}

func TestHandleMessageContextDuplicateAckFailure(t *testing.T) {
	server, err := miniredis.Run()
	if err != nil {
		t.Fatalf("start test Redis: %v", err)
	}
	t.Cleanup(server.Close)

	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() {
		if err := client.Close(); err != nil {
			t.Errorf("close Redis client: %v", err)
		}
	})

	jobID := "duplicate-ack-failure"
	completedKey := jobKeyPrefix + jobID + ":completed"
	if err := client.Set(context.Background(), completedKey, "1", jobCompletedTTL).Err(); err != nil {
		t.Fatalf("seed completion record: %v", err)
	}

	wantErr := errors.New("duplicate acknowledgment failed")
	acknowledger := &testAcknowledger{ackErr: wantErr}
	publisher := &failingTestPublisher{}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body:         []byte(`{"id":"duplicate-ack-failure","type":"welcome","message":"Hello"}`),
		Headers:      amqp.Table{},
	}

	err = handleMessageContext(
		context.Background(),
		message,
		publisher,
		NewJobProcessor(client),
	)
	if !errors.Is(err, wantErr) {
		t.Fatalf("error = %v, want %v", err, wantErr)
	}
	if acknowledger.ackCalls != 1 {
		t.Fatalf("Ack calls = %d, want 1", acknowledger.ackCalls)
	}
	if publisher.queue != "" {
		t.Fatalf("unexpected publish to %q", publisher.queue)
	}
}

func TestHandleMessageContextSuccessAckFailure(t *testing.T) {
	server, err := miniredis.Run()
	if err != nil {
		t.Fatalf("start test Redis: %v", err)
	}
	t.Cleanup(server.Close)

	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() {
		if err := client.Close(); err != nil {
			t.Errorf("close Redis client: %v", err)
		}
	})

	wantErr := errors.New("successful job acknowledgment failed")
	acknowledger := &testAcknowledger{ackErr: wantErr}
	publisher := &failingTestPublisher{}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body:         []byte(`{"id":"success-ack-failure","type":"welcome","message":"Hello"}`),
		Headers:      amqp.Table{},
	}

	err = handleMessageContext(
		context.Background(),
		message,
		publisher,
		NewJobProcessor(client),
	)
	if !errors.Is(err, wantErr) {
		t.Fatalf("error = %v, want %v", err, wantErr)
	}
	if acknowledger.ackCalls != 1 {
		t.Fatalf("Ack calls = %d, want 1", acknowledger.ackCalls)
	}
	if publisher.queue != "" {
		t.Fatalf("unexpected publish to %q", publisher.queue)
	}

	// Processing completed even though RabbitMQ acknowledgment failed.
	exists, err := client.Exists(
		context.Background(),
		jobKeyPrefix+"success-ack-failure:completed",
	).Result()
	if err != nil {
		t.Fatalf("check completion record: %v", err)
	}
	if exists != 1 {
		t.Fatal("expected completion record to remain after acknowledgment failure")
	}
}

type cancelOnQueuePublisher struct {
	queue  string
	cancel context.CancelFunc
}

func (p *cancelOnQueuePublisher) publish(
	ctx context.Context,
	queue string,
	body []byte,
	headers amqp.Table,
) error {
	p.queue = queue

	if queue == deadQueue {
		p.cancel()
	}

	return nil
}

func TestHandleMessageContextCanceledAfterDeadLetterPublishDoesNotAck(
	t *testing.T,
) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	publisher := &cancelOnQueuePublisher{cancel: cancel}
	acknowledger := &testAcknowledger{}

	attempt := 0
	for {
		_, _, _, deadLetter := retryDecision(attempt)
		if deadLetter {
			break
		}
		attempt++
		if attempt > 100 {
			t.Fatal("retryDecision never selected dead-lettering")
		}
	}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body: []byte(
			`{"id":"cancel-dead-letter","type":"welcome","message":"Hello"}`,
		),
		Headers: amqp.Table{attemptHeader: int32(attempt)},
	}

	err := handleMessageContext(ctx, message, publisher, &JobProcessor{})

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context.Canceled", err)
	}
	if publisher.queue != deadQueue {
		t.Fatalf("published to %q, want %q", publisher.queue, deadQueue)
	}
	if acknowledger.ackCalls != 0 {
		t.Fatalf("Ack calls = %d, want 0", acknowledger.ackCalls)
	}
}

func TestHandleMessageContextCanceledDuringProcessingDoesNotAck(
	t *testing.T,
) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	redisErr := errors.New("simulated Redis failure")
	baseStore := &scriptedIdempotencyStore{}
	processor := newProcessorWithScriptedStore(t, baseStore)

	processor.store = &cancelOnExistsErrorStore{
		scriptedIdempotencyStore: baseStore,
		cancel:                   cancel,
		err:                      redisErr,
	}

	acknowledger := &testAcknowledger{}
	publisher := &failingTestPublisher{}

	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body: []byte(
			`{"id":"cancel-during-processing","type":"welcome","message":"Hello"}`,
		),
	}

	err := handleMessageContext(ctx, message, publisher, processor)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context.Canceled", err)
	}
	if acknowledger.ackCalls != 0 {
		t.Fatalf("Ack calls = %d, want 0", acknowledger.ackCalls)
	}
	if publisher.queue != "" {
		t.Fatalf("published to %q, want no publish", publisher.queue)
	}
}

func TestHandleMessageContextCanceledBeforeDuplicateAck(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	baseStore := &scriptedIdempotencyStore{}
	processor := newProcessorWithScriptedStore(t, baseStore)

	processor.store = &cancelOnCompletedExistsStore{
		scriptedIdempotencyStore: baseStore,
		cancel:                   cancel,
	}

	acknowledger := &testAcknowledger{}
	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body:         []byte(`{"id":"cancel-before-duplicate-ack","type":"welcome","message":"Hello"}`),
	}

	err := handleMessageContext(
		ctx,
		message,
		&failingTestPublisher{},
		processor,
	)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context.Canceled", err)
	}
	if acknowledger.ackCalls != 0 {
		t.Fatalf("Ack calls = %d, want 0", acknowledger.ackCalls)
	}
}

func TestHandleMessageContextCanceledBeforeSuccessAck(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	baseStore := &scriptedIdempotencyStore{}
	processor := newProcessorWithScriptedStore(t, baseStore)

	processor.store = &cancelOnSetStore{
		scriptedIdempotencyStore: baseStore,
		cancel:                   cancel,
	}

	acknowledger := &testAcknowledger{}
	message := amqp.Delivery{
		Acknowledger: acknowledger,
		DeliveryTag:  1,
		Body:         []byte(`{"id":"cancel-before-success-ack","type":"welcome","message":"Hello"}`),
	}

	err := handleMessageContext(
		ctx,
		message,
		&failingTestPublisher{},
		processor,
	)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context.Canceled", err)
	}
	if acknowledger.ackCalls != 0 {
		t.Fatalf("Ack calls = %d, want 0", acknowledger.ackCalls)
	}
}
