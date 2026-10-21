// Package main contains tests for rabbitmq test in the Relay jobs worker.

package main

import (
	"bytes"
	"context"
	"errors"
	"log"
	"strings"
	"testing"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

// fakeRabbitMQConnection simulates a RabbitMQ connection.
type fakeRabbitMQConnection struct {
	channels      []rabbitMQChannel
	channelErrors map[int]error
	channelCalls  int
	closeErr      error
	closed        bool
}

func (c *fakeRabbitMQConnection) Channel() (rabbitMQChannel, error) {
	c.channelCalls++

	if err := c.channelErrors[c.channelCalls]; err != nil {
		return nil, err
	}

	index := c.channelCalls - 1
	if index >= len(c.channels) {
		return nil, errors.New("unexpected channel request")
	}

	return c.channels[index], nil
}

func (c *fakeRabbitMQConnection) Close() error {
	c.closed = true
	return c.closeErr
}

// fakeRabbitMQChannel simulates the RabbitMQ channel methods
// used by the worker.
type fakeRabbitMQChannel struct {
	queueErrName string
	queueErr     error
	confirmErr   error
	qosErr       error
	consumeErr   error
	cancelErr    error
	closeErr     error

	queueCalls   int
	qosCalls     int
	consumeCalls int
	cancelCalls  int
	closeCalls   int

	messages <-chan amqp.Delivery
	onCancel func()
}

func (c *fakeRabbitMQChannel) QueueDeclare(
	name string,
	durable, autoDelete, exclusive, noWait bool,
	args amqp.Table,
) (amqp.Queue, error) {
	c.queueCalls++

	if name == c.queueErrName {
		return amqp.Queue{}, c.queueErr
	}

	return amqp.Queue{Name: name}, nil
}

func (c *fakeRabbitMQChannel) Confirm(noWait bool) error {
	return c.confirmErr
}

func (c *fakeRabbitMQChannel) NotifyPublish(
	confirms chan amqp.Confirmation,
) chan amqp.Confirmation {
	return confirms
}

func (c *fakeRabbitMQChannel) NotifyReturn(
	returns chan amqp.Return,
) chan amqp.Return {
	return returns
}

func (c *fakeRabbitMQChannel) PublishWithContext(
	ctx context.Context,
	exchange, key string,
	mandatory, immediate bool,
	msg amqp.Publishing,
) error {
	return nil
}

func (c *fakeRabbitMQChannel) Qos(
	prefetchCount, prefetchSize int,
	global bool,
) error {
	c.qosCalls++
	return c.qosErr
}

func (c *fakeRabbitMQChannel) Consume(
	queue, consumer string,
	autoAck, exclusive, noLocal, noWait bool,
	args amqp.Table,
) (<-chan amqp.Delivery, error) {
	c.consumeCalls++

	if c.consumeErr != nil {
		return nil, c.consumeErr
	}

	if c.messages != nil {
		return c.messages, nil
	}

	messages := make(chan amqp.Delivery)
	return messages, nil
}

func (c *fakeRabbitMQChannel) Cancel(
	consumer string,
	noWait bool,
) error {
	c.cancelCalls++
	if c.onCancel != nil {
		c.onCancel()
	}
	return c.cancelErr
}

func (c *fakeRabbitMQChannel) Close() error {
	c.closeCalls++
	return c.closeErr
}

func TestRunRabbitMQSessionWithDialer_DialFailure(t *testing.T) {
	wantErr := errors.New("connection refused")

	dial := func(_ string) (rabbitMQConnection, error) {
		return nil, wantErr
	}

	err := runRabbitMQSessionWithDialer(
		context.Background(),
		"amqp://invalid",
		nil,
		dial,
	)

	if err == nil {
		t.Fatal("expected an error, got nil")
	}

	if !errors.Is(err, wantErr) {
		t.Fatalf("error = %v, want wrapped error %v", err, wantErr)
	}

	if !strings.Contains(err.Error(), "connect to RabbitMQ") {
		t.Fatalf("error = %v, want connection error context", err)
	}
}

func TestRunRabbitMQSessionWithDialer_StartupFailures(t *testing.T) {
	channelErr := errors.New("channel failed")
	mainQueueErr := errors.New("main queue failed")
	topologyErr := errors.New("dead-letter queue failed")
	confirmErr := errors.New("publisher confirms failed")
	qosErr := errors.New("qos failed")
	consumeErr := errors.New("consume failed")

	tests := []struct {
		name        string
		setup       func(*fakeRabbitMQConnection, *fakeRabbitMQChannel, *fakeRabbitMQChannel)
		wantErr     error
		wantMessage string
	}{
		{
			name: "consumer channel failure",
			setup: func(
				conn *fakeRabbitMQConnection,
				consumer, publisher *fakeRabbitMQChannel,
			) {
				conn.channelErrors[1] = channelErr
			},
			wantErr:     channelErr,
			wantMessage: "open consumer channel",
		},
		{
			name: "main queue declaration failure",
			setup: func(
				conn *fakeRabbitMQConnection,
				consumer, publisher *fakeRabbitMQChannel,
			) {
				consumer.queueErrName = mainQueue
				consumer.queueErr = mainQueueErr
			},
			wantErr:     mainQueueErr,
			wantMessage: "declare main queue",
		},
		{
			name: "reliability topology failure",
			setup: func(
				conn *fakeRabbitMQConnection,
				consumer, publisher *fakeRabbitMQChannel,
			) {
				consumer.queueErrName = deadQueue
				consumer.queueErr = topologyErr
			},
			wantErr:     topologyErr,
			wantMessage: "declare reliability queues",
		},
		{
			name: "publisher channel failure",
			setup: func(
				conn *fakeRabbitMQConnection,
				consumer, publisher *fakeRabbitMQChannel,
			) {
				conn.channelErrors[2] = channelErr
			},
			wantErr:     channelErr,
			wantMessage: "open publisher channel",
		},
		{
			name: "publisher initialization failure",
			setup: func(
				conn *fakeRabbitMQConnection,
				consumer, publisher *fakeRabbitMQChannel,
			) {
				publisher.confirmErr = confirmErr
			},
			wantErr:     confirmErr,
			wantMessage: "initialize reliable publisher",
		},
		{
			name: "qos configuration failure",
			setup: func(
				conn *fakeRabbitMQConnection,
				consumer, publisher *fakeRabbitMQChannel,
			) {
				consumer.qosErr = qosErr
			},
			wantErr:     qosErr,
			wantMessage: "configure prefetch",
		},
		{
			name: "consumer startup failure",
			setup: func(
				conn *fakeRabbitMQConnection,
				consumer, publisher *fakeRabbitMQChannel,
			) {
				consumer.consumeErr = consumeErr
			},
			wantErr:     consumeErr,
			wantMessage: "start consumer",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			consumer := &fakeRabbitMQChannel{}
			publisher := &fakeRabbitMQChannel{}

			conn := &fakeRabbitMQConnection{
				channels: []rabbitMQChannel{
					consumer,
					publisher,
				},
				channelErrors: make(map[int]error),
			}

			tt.setup(conn, consumer, publisher)

			dial := func(_ string) (rabbitMQConnection, error) {
				return conn, nil
			}

			err := runRabbitMQSessionWithDialer(
				context.Background(),
				"amqp://fake",
				nil,
				dial,
			)

			if err == nil {
				t.Fatal("expected an error, got nil")
			}

			if !errors.Is(err, tt.wantErr) {
				t.Errorf("error = %v, want wrapped error %v", err, tt.wantErr)
			}

			if !strings.Contains(err.Error(), tt.wantMessage) {
				t.Errorf(
					"error = %v, want context %q",
					err,
					tt.wantMessage,
				)
			}

			if !conn.closed {
				t.Error("expected connection to be closed")
			}

			consumerShouldBeClosed := tt.name != "consumer channel failure"

			if consumerShouldBeClosed && consumer.closeCalls != 1 {
				t.Errorf(
					"consumer channel close calls = %d, want 1",
					consumer.closeCalls,
				)
			}

			publisherShouldBeClosed :=
				tt.name != "consumer channel failure" &&
					tt.name != "main queue declaration failure" &&
					tt.name != "reliability topology failure" &&
					tt.name != "publisher channel failure"

			if publisherShouldBeClosed && publisher.closeCalls != 1 {
				t.Errorf(
					"publisher channel close calls = %d, want 1",
					publisher.closeCalls,
				)
			}

		})
	}
}

func TestRunRabbitMQSessionWithDialer_SuccessfulStartupAndShutdown(t *testing.T) {
	deliveries := make(chan amqp.Delivery)
	close(deliveries)

	consumer := &fakeRabbitMQChannel{
		messages: deliveries,
	}
	publisher := &fakeRabbitMQChannel{}

	conn := &fakeRabbitMQConnection{
		channels: []rabbitMQChannel{
			consumer,
			publisher,
		},
		channelErrors: map[int]error{},
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Trigger graceful shutdown after startup.

	dial := func(_ string) (rabbitMQConnection, error) {
		return conn, nil
	}

	err := runRabbitMQSessionWithDialer(
		ctx,
		"amqp://test",
		nil,
		dial,
	)
	if err != nil {
		t.Fatalf("runRabbitMQSessionWithDialer() error = %v, want nil", err)
	}

	if conn.channelCalls != 2 {
		t.Errorf("connection channel calls = %d, want 2", conn.channelCalls)
	}

	if consumer.qosCalls != 1 {
		t.Errorf("consumer QoS calls = %d, want 1", consumer.qosCalls)
	}

	if consumer.consumeCalls != 1 {
		t.Errorf("consumer Consume calls = %d, want 1", consumer.consumeCalls)
	}

	if consumer.cancelCalls != 1 {
		t.Errorf("consumer Cancel calls = %d, want 1", consumer.cancelCalls)
	}

	if consumer.closeCalls != 1 {
		t.Errorf("consumer Close calls = %d, want 1", consumer.closeCalls)
	}

	if publisher.closeCalls != 1 {
		t.Errorf("publisher Close calls = %d, want 1", publisher.closeCalls)
	}

	if !conn.closed {
		t.Error("RabbitMQ connection was not closed")
	}
}

func TestRunRabbitMQSessionWithDialer_CancelFailureStillCleansUp(t *testing.T) {
	cancelErr := errors.New("consumer cancel failed")

	deliveries := make(chan amqp.Delivery)
	close(deliveries)

	consumer := &fakeRabbitMQChannel{
		messages:  deliveries,
		cancelErr: cancelErr,
	}
	publisher := &fakeRabbitMQChannel{}

	conn := &fakeRabbitMQConnection{
		channels: []rabbitMQChannel{
			consumer,
			publisher,
		},
		channelErrors: map[int]error{},
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	dial := func(_ string) (rabbitMQConnection, error) {
		return conn, nil
	}

	err := runRabbitMQSessionWithDialer(
		ctx,
		"amqp://test",
		nil,
		dial,
	)

	if err == nil {
		t.Fatal("expected an error when consumer cancellation fails")
	}

	if !errors.Is(err, cancelErr) {
		t.Errorf("error = %v, want wrapped error %v", err, cancelErr)
	}

	if !strings.Contains(err.Error(), "run consumer") {
		t.Errorf("error = %v, want context %q", err, "run consumer")
	}

	if consumer.cancelCalls != 1 {
		t.Errorf("consumer Cancel calls = %d, want 1", consumer.cancelCalls)
	}

	if consumer.closeCalls != 1 {
		t.Errorf("consumer Close calls = %d, want 1", consumer.closeCalls)
	}

	if publisher.closeCalls != 1 {
		t.Errorf("publisher Close calls = %d, want 1", publisher.closeCalls)
	}

	if !conn.closed {
		t.Error("expected RabbitMQ connection to be closed")
	}
}

func TestRunRabbitMQSessionWithDialer_ConsumerRuntimeError(t *testing.T) {

	deliveries := make(chan amqp.Delivery)
	close(deliveries)

	consumer := &fakeRabbitMQChannel{
		messages: deliveries,
	}
	publisher := &fakeRabbitMQChannel{}

	conn := &fakeRabbitMQConnection{
		channels: []rabbitMQChannel{
			consumer,
			publisher,
		},
		channelErrors: map[int]error{},
	}

	dial := func(_ string) (rabbitMQConnection, error) {
		return conn, nil
	}

	err := runRabbitMQSessionWithDialer(
		context.Background(),
		"amqp://test",
		nil,
		dial,
	)

	if err == nil {
		t.Fatal("expected an error, got nil")
	}

	if !errors.Is(err, errConsumerChannelClosed) {
		t.Errorf(
			"error = %v, want wrapped error %v",
			err,
			errConsumerChannelClosed,
		)
	}

	if !strings.Contains(err.Error(), "run consumer") {
		t.Errorf(
			"error = %v, want context %q",
			err,
			"run consumer",
		)
	}

	if !conn.closed {
		t.Error("expected RabbitMQ connection to be closed")
	}

	if consumer.closeCalls != 1 {
		t.Errorf(
			"consumer channel close calls = %d, want 1",
			consumer.closeCalls,
		)
	}

	if publisher.closeCalls != 1 {
		t.Errorf(
			"publisher channel close calls = %d, want 1",
			publisher.closeCalls,
		)
	}
}

func TestRunRabbitMQSession_InvalidURL(t *testing.T) {
	err := runRabbitMQSession(
		context.Background(),
		"invalid://rabbitmq-url",
		nil,
	)

	if err == nil {
		t.Fatal("expected an error for an invalid RabbitMQ URL, got nil")
	}
}

func TestRunRabbitMQSessionWithDialer_LogsCleanupErrors(t *testing.T) {
	connectionErr := errors.New("connection close failed")
	consumerErr := errors.New("consumer close failed")
	publisherErr := errors.New("publisher close failed")

	messages := make(chan amqp.Delivery)
	close(messages)

	consumer := &fakeRabbitMQChannel{
		messages: messages,
		closeErr: consumerErr,
	}
	publisher := &fakeRabbitMQChannel{
		closeErr: publisherErr,
	}

	conn := &fakeRabbitMQConnection{
		channels:      []rabbitMQChannel{consumer, publisher},
		channelErrors: make(map[int]error),
		closeErr:      connectionErr,
	}

	var logs bytes.Buffer
	previousLogger := log.Writer()
	log.SetOutput(&logs)
	defer log.SetOutput(previousLogger)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := runRabbitMQSessionWithDialer(
		ctx,
		"amqp://fake",
		nil,
		func(string) (rabbitMQConnection, error) {
			return conn, nil
		},
	)

	if err != nil {
		t.Fatalf("expected clean shutdown, got error: %v", err)
	}

	if consumer.closeCalls != 1 {
		t.Errorf("consumer close calls = %d, want 1", consumer.closeCalls)
	}

	if publisher.closeCalls != 1 {
		t.Errorf("publisher close calls = %d, want 1", publisher.closeCalls)
	}

	if !conn.closed {
		t.Error("expected connection to be closed")
	}

	for _, want := range []string{
		connectionErr.Error(),
		consumerErr.Error(),
		publisherErr.Error(),
	} {
		if !strings.Contains(logs.String(), want) {
			t.Errorf("cleanup logs %q do not contain %q", logs.String(), want)
		}
	}
}

func TestDialRabbitMQ_InvalidURL(t *testing.T) {
	conn, err := dialRabbitMQ("://invalid-url")

	if err == nil {
		t.Fatal("expected an error for an invalid RabbitMQ URL")
	}

	if conn != nil {
		t.Fatal("expected nil connection when dialing fails")
	}
}

type cancelOnAckAcknowledger struct {
	cancel     context.CancelFunc
	deliveries chan amqp.Delivery
	ackCalls   int
}

func (a *cancelOnAckAcknowledger) Ack(
	tag uint64,
	multiple bool,
) error {
	a.ackCalls++
	close(a.deliveries)
	a.cancel()
	return nil
}

func (a *cancelOnAckAcknowledger) Nack(
	tag uint64,
	multiple bool,
	requeue bool,
) error {
	return nil
}

func (a *cancelOnAckAcknowledger) Reject(
	tag uint64,
	requeue bool,
) error {
	return nil
}

func TestRunRabbitMQSessionWithDialerHandlesDelivery(t *testing.T) {

	processor := newTestJobProcessor(t)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	deliveries := make(chan amqp.Delivery, 1)

	acknowledger := &cancelOnAckAcknowledger{
		cancel:     cancel,
		deliveries: deliveries,
	}

	deliveries <- amqp.Delivery{
		Body: []byte(
			`{"id":"rabbitmq-session-test","type":"welcome","message":"hello"}`,
		),
		Acknowledger: acknowledger,
	}

	consumer := &fakeRabbitMQChannel{
		messages: deliveries,
	}
	publisher := &fakeRabbitMQChannel{}

	conn := &fakeRabbitMQConnection{
		channels: []rabbitMQChannel{
			consumer,
			publisher,
		},
		channelErrors: map[int]error{},
	}

	err := runRabbitMQSessionWithDialer(
		ctx,
		"amqp://test",
		processor,
		func(string) (rabbitMQConnection, error) {
			return conn, nil
		},
	)
	if err != nil {
		t.Fatalf(
			"runRabbitMQSessionWithDialer() error = %v, want nil",
			err,
		)
	}

	if acknowledger.ackCalls != 1 {
		t.Errorf(
			"delivery acknowledgments = %d, want 1",
			acknowledger.ackCalls,
		)
	}

	if consumer.cancelCalls != 1 {
		t.Errorf(
			"consumer Cancel calls = %d, want 1",
			consumer.cancelCalls,
		)
	}

	if !conn.closed {
		t.Error("RabbitMQ connection was not closed")
	}
}

func TestRunRabbitMQSessionWithDialer_HeartbeatFailureAndCleanup(t *testing.T) {
	server, client := newHeartbeatTestStore(t)
	server.Close()

	previousRunner := runWorkerHeartbeatForSession
	runWorkerHeartbeatForSession = func(
		context.Context,
		workerHeartbeatStore,
		time.Duration,
	) error {
		return errors.New("forced heartbeat failure")
	}
	defer func() {
		runWorkerHeartbeatForSession = previousRunner
	}()

	messages := make(chan amqp.Delivery)
	consumer := &fakeRabbitMQChannel{
		messages: messages,
		onCancel: func() {
			close(messages)
		},
	}
	publisher := &fakeRabbitMQChannel{}
	conn := &fakeRabbitMQConnection{
		channels:      []rabbitMQChannel{consumer, publisher},
		channelErrors: make(map[int]error),
	}

	processor := NewJobProcessor(client)

	var logs bytes.Buffer
	previousLogger := log.Writer()
	log.SetOutput(&logs)
	defer log.SetOutput(previousLogger)

	err := runRabbitMQSessionWithDialer(
		context.Background(),
		"amqp://test",
		processor,
		func(string) (rabbitMQConnection, error) {
			return conn, nil
		},
	)

	if err == nil || !strings.Contains(err.Error(), "worker heartbeat") {
		t.Fatalf("error = %v, want worker heartbeat failure", err)
	}
	if !strings.Contains(logs.String(), "remove worker heartbeat") {
		t.Fatalf("logs = %q, want heartbeat cleanup error", logs.String())
	}
}
