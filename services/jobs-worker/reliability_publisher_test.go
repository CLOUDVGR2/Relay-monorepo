// Package main contains tests for reliability publisher test in the Relay jobs worker.

package main

import (
	"context"
	"errors"
	"strings"
	"testing"

	amqp "github.com/rabbitmq/amqp091-go"
)

// fakeReliablePublisherChannel simulates RabbitMQ for deterministic unit tests.
type fakeReliablePublisherChannel struct {
	confirmErr   error
	publishErr   error
	confirms     chan amqp.Confirmation
	returns      chan amqp.Return
	publishCalls int
	confirmCalls int
}

func (f *fakeReliablePublisherChannel) Confirm(noWait bool) error {
	f.confirmCalls++
	return f.confirmErr
}

func (f *fakeReliablePublisherChannel) NotifyPublish(
	confirm chan amqp.Confirmation,
) chan amqp.Confirmation {
	if f.confirms != nil {
		return f.confirms
	}
	return confirm
}

func (f *fakeReliablePublisherChannel) NotifyReturn(
	receiver chan amqp.Return,
) chan amqp.Return {
	if f.returns != nil {
		return f.returns
	}
	return receiver
}

func (f *fakeReliablePublisherChannel) PublishWithContext(
	ctx context.Context,
	exchange string,
	key string,
	mandatory bool,
	immediate bool,
	msg amqp.Publishing,
) error {
	f.publishCalls++
	return f.publishErr
}

func newTestReliablePublisher(
	t *testing.T,
	fake *fakeReliablePublisherChannel,
) *reliablePublisher {
	t.Helper()

	publisher, err := newReliablePublisherWithChannel(fake)
	if err != nil {
		t.Fatalf("create reliable publisher: %v", err)
	}

	return publisher
}

func TestNewReliablePublisherWithChannelConfirmFailure(t *testing.T) {
	wantErr := errors.New("confirm setup failed")

	fake := &fakeReliablePublisherChannel{
		confirmErr: wantErr,
	}

	publisher, err := newReliablePublisherWithChannel(fake)

	if err == nil {
		t.Fatal("expected publisher initialization error")
	}
	if publisher != nil {
		t.Fatal("expected nil publisher on initialization failure")
	}
	if !errors.Is(err, wantErr) {
		t.Fatalf("error = %v, want wrapped error %v", err, wantErr)
	}
	if fake.confirmCalls != 1 {
		t.Fatalf("Confirm calls = %d, want 1", fake.confirmCalls)
	}
}

func TestReliablePublisherPublishSuccess(t *testing.T) {
	confirms := make(chan amqp.Confirmation, 1)
	confirms <- amqp.Confirmation{Ack: true}

	fake := &fakeReliablePublisherChannel{
		confirms: confirms,
		returns:  make(chan amqp.Return, 1),
	}

	publisher := newTestReliablePublisher(t, fake)

	err := publisher.publish(
		context.Background(),
		"go.jobs",
		[]byte(`{"test":"success"}`),
		nil,
	)
	if err != nil {
		t.Fatalf("publish returned error: %v", err)
	}

	if fake.publishCalls != 1 {
		t.Fatalf("publish calls = %d, want 1", fake.publishCalls)
	}
	if publisher.failed != nil {
		t.Fatalf("publisher unexpectedly marked failed: %v", publisher.failed)
	}
}

func TestReliablePublisherPublishError(t *testing.T) {
	wantErr := errors.New("simulated publish failure")

	fake := &fakeReliablePublisherChannel{
		publishErr: wantErr,
		confirms:   make(chan amqp.Confirmation, 1),
		returns:    make(chan amqp.Return, 1),
	}

	publisher := newTestReliablePublisher(t, fake)

	err := publisher.publish(
		context.Background(),
		"go.jobs",
		[]byte(`{"test":"publish-error"}`),
		nil,
	)
	if err == nil {
		t.Fatal("expected publish error")
	}
	if !errors.Is(err, wantErr) {
		t.Fatalf("error = %v, want wrapped error %v", err, wantErr)
	}
	if publisher.failed == nil {
		t.Fatal("expected publisher to be marked failed")
	}
}

func TestReliablePublisherNegativeConfirmation(t *testing.T) {
	confirms := make(chan amqp.Confirmation, 1)
	confirms <- amqp.Confirmation{Ack: false}

	fake := &fakeReliablePublisherChannel{
		confirms: confirms,
		returns:  make(chan amqp.Return, 1),
	}

	publisher := newTestReliablePublisher(t, fake)

	err := publisher.publish(
		context.Background(),
		"go.jobs",
		[]byte(`{"test":"nack"}`),
		nil,
	)
	if err == nil {
		t.Fatal("expected error for negative confirmation")
	}
	if !strings.Contains(err.Error(), "negatively acknowledged") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestReliablePublisherClosedConfirmationChannel(t *testing.T) {
	confirms := make(chan amqp.Confirmation)
	close(confirms)

	fake := &fakeReliablePublisherChannel{
		confirms: confirms,
		returns:  make(chan amqp.Return, 1),
	}

	publisher := newTestReliablePublisher(t, fake)

	err := publisher.publish(
		context.Background(),
		"go.jobs",
		[]byte(`{"test":"closed-confirmation"}`),
		nil,
	)
	if err == nil {
		t.Fatal("expected error for closed confirmation channel")
	}
	if !strings.Contains(err.Error(), "confirmation channel closed") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestReliablePublisherConfirmationContextCanceled(t *testing.T) {
	fake := &fakeReliablePublisherChannel{
		confirms: make(chan amqp.Confirmation),
		returns:  make(chan amqp.Return, 1),
	}

	publisher := newTestReliablePublisher(t, fake)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := publisher.publish(
		ctx,
		"go.jobs",
		[]byte(`{"test":"context-canceled"}`),
		nil,
	)
	if err == nil {
		t.Fatal("expected error when confirmation context is canceled")
	}
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context.Canceled", err)
	}
}

func TestReliablePublisherReturnedMessage(t *testing.T) {
	confirms := make(chan amqp.Confirmation, 1)
	confirms <- amqp.Confirmation{Ack: true}

	returns := make(chan amqp.Return, 1)
	returns <- amqp.Return{
		ReplyCode:  312,
		ReplyText:  "NO_ROUTE",
		RoutingKey: "missing.queue",
	}

	fake := &fakeReliablePublisherChannel{
		confirms: confirms,
		returns:  returns,
	}

	publisher := newTestReliablePublisher(t, fake)

	err := publisher.publish(
		context.Background(),
		"missing.queue",
		[]byte(`{"test":"unroutable"}`),
		nil,
	)
	if err == nil {
		t.Fatal("expected error for returned message")
	}
	if !strings.Contains(err.Error(), "unroutable") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestReliablePublisherClosedReturnChannel(t *testing.T) {
	confirms := make(chan amqp.Confirmation, 1)
	confirms <- amqp.Confirmation{Ack: true}

	returns := make(chan amqp.Return)
	close(returns)

	fake := &fakeReliablePublisherChannel{
		confirms: confirms,
		returns:  returns,
	}

	publisher := newTestReliablePublisher(t, fake)

	err := publisher.publish(
		context.Background(),
		"go.jobs",
		[]byte(`{"test":"closed-return"}`),
		nil,
	)
	if err == nil {
		t.Fatal("expected error for closed return channel")
	}
	if !strings.Contains(err.Error(), "return channel closed") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPublisherRefusesReuseAfterFailure(t *testing.T) {
	previousErr := errors.New("simulated previous publish failure")

	fake := &fakeReliablePublisherChannel{
		confirms: make(chan amqp.Confirmation, 1),
		returns:  make(chan amqp.Return, 1),
	}

	publisher := &reliablePublisher{
		ch:       fake,
		confirms: fake.confirms,
		returns:  fake.returns,
		failed:   previousErr,
	}

	err := publisher.publish(
		context.Background(),
		"go.jobs.retry.5s",
		[]byte(`{"test":"retry"}`),
		nil,
	)

	if err == nil {
		t.Fatal("expected an error when reusing a failed publisher")
	}
	if !strings.Contains(err.Error(), "unusable") {
		t.Fatalf("expected publisher to be unusable, got: %v", err)
	}
	if !errors.Is(err, previousErr) {
		t.Fatalf("expected previous error to be wrapped, got: %v", err)
	}
	if fake.publishCalls != 0 {
		t.Fatalf("publish calls = %d, want 0 for failed publisher", fake.publishCalls)
	}
}

// TestNewReliablePublisherWrapper covers the public wrapper.
func TestNewReliablePublisherWrapper(t *testing.T) {
	fake := &fakeReliablePublisherChannel{
		confirms: make(chan amqp.Confirmation, 1),
		returns:  make(chan amqp.Return, 1),
	}

	publisher, err := newReliablePublisher(fake)
	if err != nil {
		t.Fatalf("newReliablePublisher() error = %v", err)
	}

	if publisher == nil {
		t.Fatal("expected a publisher, got nil")
	}

	if fake.confirmCalls != 1 {
		t.Fatalf("Confirm calls = %d, want 1", fake.confirmCalls)
	}
}
