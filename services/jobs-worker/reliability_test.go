// Package main contains tests for reliability test in the Relay jobs worker.

package main

import (
	"context"
	"errors"
	"testing"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

func TestRetryDelays(t *testing.T) {
	want := []time.Duration{
		5 * time.Second,
		30 * time.Second,
		2 * time.Minute,
		5 * time.Minute,
	}

	if len(retryDelays) != len(want) {
		t.Fatalf("retryDelays has %d entries, want %d",
			len(retryDelays), len(want))
	}

	for i, delay := range want {
		if retryDelays[i] != delay {
			t.Errorf("retryDelays[%d] = %v, want %v",
				i, retryDelays[i], delay)
		}
	}
}

func TestMaxAttempts(t *testing.T) {
	if maxAttempts != 5 {
		t.Fatalf("maxAttempts = %d, want 5", maxAttempts)
	}

	if len(retryDelays) != maxAttempts-1 {
		t.Fatalf("retryDelays has %d entries; want %d retries",
			len(retryDelays), maxAttempts-1)
	}
}

func TestRetryQueueName(t *testing.T) {
	tests := []struct {
		delay time.Duration
		want  string
	}{
		{5 * time.Second, "go.jobs.retry.5s"},
		{30 * time.Second, "go.jobs.retry.30s"},
		{2 * time.Minute, "go.jobs.retry.120s"},
		{5 * time.Minute, "go.jobs.retry.300s"},
	}

	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			got := retryQueueName(tt.delay)

			if got != tt.want {
				t.Errorf("retryQueueName(%v) = %q, want %q",
					tt.delay, got, tt.want)
			}
		})
	}
}

func TestRetryDecision(t *testing.T) {
	tests := []struct {
		name           string
		attempt        int
		wantQueue      string
		wantNext       int
		wantDelay      time.Duration
		wantDeadLetter bool
	}{
		{
			name:      "initial failure retries after 5 seconds",
			attempt:   0,
			wantQueue: "go.jobs.retry.5s",
			wantNext:  1,
			wantDelay: 5 * time.Second,
		},
		{
			name:      "second failure retries after 30 seconds",
			attempt:   1,
			wantQueue: "go.jobs.retry.30s",
			wantNext:  2,
			wantDelay: 30 * time.Second,
		},
		{
			name:      "third failure retries after 2 minutes",
			attempt:   2,
			wantQueue: "go.jobs.retry.120s",
			wantNext:  3,
			wantDelay: 2 * time.Minute,
		},
		{
			name:      "fourth failure retries after 5 minutes",
			attempt:   3,
			wantQueue: "go.jobs.retry.300s",
			wantNext:  4,
			wantDelay: 5 * time.Minute,
		},
		{
			name:           "fifth failure goes to dead letter queue",
			attempt:        4,
			wantQueue:      "go.jobs.dlq",
			wantNext:       4,
			wantDeadLetter: true,
		},
		{
			name:      "negative attempt is treated as initial failure",
			attempt:   -1,
			wantQueue: "go.jobs.retry.5s",
			wantNext:  1,
			wantDelay: 5 * time.Second,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			queue, next, delay, dead := retryDecision(tt.attempt)

			if queue != tt.wantQueue {
				t.Errorf("queue = %q, want %q", queue, tt.wantQueue)
			}
			if next != tt.wantNext {
				t.Errorf("nextAttempt = %d, want %d", next, tt.wantNext)
			}
			if delay != tt.wantDelay {
				t.Errorf("delay = %v, want %v", delay, tt.wantDelay)
			}
			if dead != tt.wantDeadLetter {
				t.Errorf("deadLetter = %v, want %v", dead, tt.wantDeadLetter)
			}
		})
	}
}

// reliabilityTestAcknowledger records acknowledgments made by handleMessage.
type reliabilityTestAcknowledger struct {
	ackCount int
}

func (a *reliabilityTestAcknowledger) Ack(tag uint64, multiple bool) error {
	a.ackCount++
	return nil
}

func (a *reliabilityTestAcknowledger) Nack(tag uint64, multiple, requeue bool) error {
	return nil
}

func (a *reliabilityTestAcknowledger) Reject(tag uint64, requeue bool) error {
	return nil
}

// recordingTestPublisher records the destination and headers of a publish.
type recordingTestPublisher struct {
	queue   string
	headers amqp.Table
	err     error
}

func (p *recordingTestPublisher) publish(
	ctx context.Context,
	queue string,
	body []byte,
	headers amqp.Table,
) error {
	p.queue = queue
	p.headers = headers
	return p.err
}

func TestExhaustedJobPublishesToDLQBeforeAck(t *testing.T) {
	acker := &reliabilityTestAcknowledger{}
	publisher := &recordingTestPublisher{}

	message := amqp.Delivery{
		Acknowledger: acker,
		DeliveryTag:  1,
		Headers: amqp.Table{
			attemptHeader: int32(4),
		},
		Body: []byte(
			`{"id":"dlq-test","type":"welcome","message":"hello"}`,
		),
	}

	err := handleMessage(message, publisher, &JobProcessor{})
	if err != nil {
		t.Fatalf("handleMessage returned error: %v", err)
	}

	if publisher.queue != deadQueue {
		t.Fatalf("published to %q, want %q", publisher.queue, deadQueue)
	}

	if got := publisher.headers[reasonHeader]; got != "maximum attempts exceeded" {
		t.Fatalf("DLQ reason = %v, want maximum attempts exceeded", got)
	}

	if acker.ackCount != 1 {
		t.Fatalf("ack count = %d, want 1", acker.ackCount)
	}
}

func TestExhaustedJobPublishFailureDoesNotAck(t *testing.T) {
	acker := &reliabilityTestAcknowledger{}
	publisher := &recordingTestPublisher{
		err: errors.New("simulated DLQ publish failure"),
	}

	message := amqp.Delivery{
		Acknowledger: acker,
		DeliveryTag:  1,
		Headers: amqp.Table{
			attemptHeader: int32(4),
		},
		Body: []byte(
			`{"id":"dlq-test","type":"welcome","message":"hello"}`,
		),
	}

	err := handleMessage(message, publisher, &JobProcessor{})
	if err == nil {
		t.Fatal("expected error when DLQ publishing fails")
	}

	if publisher.queue != deadQueue {
		t.Fatalf("published to %q, want %q", publisher.queue, deadQueue)
	}

	if acker.ackCount != 0 {
		t.Fatalf("ack count = %d, want 0 after publish failure", acker.ackCount)
	}
}

func TestRetryPublishPreservesHeadersAndIncrementsAttempt(t *testing.T) {
	acker := &reliabilityTestAcknowledger{}
	publisher := &recordingTestPublisher{}

	message := amqp.Delivery{
		Acknowledger: acker,
		DeliveryTag:  1,
		Headers: amqp.Table{
			"correlation-id": "corr-123",
			attemptHeader:    int32(0),
		},
		Body: []byte(
			`{"id":"retry-test","type":"welcome","message":"hello"}`,
		),
	}

	err := handleMessage(message, publisher, &JobProcessor{})
	if err != nil {
		t.Fatalf("handleMessage returned error: %v", err)
	}

	if publisher.queue != retryQueueName(retryDelays[0]) {
		t.Errorf("published to %q, want %q",
			publisher.queue, retryQueueName(retryDelays[0]))
	}

	if got := publisher.headers[attemptHeader]; got != int32(1) {
		t.Errorf("retry attempt header = %v, want int32(1)", got)
	}

	if got := publisher.headers["correlation-id"]; got != "corr-123" {
		t.Errorf("correlation-id = %v, want corr-123", got)
	}

	if got, ok := publisher.headers[errorHeader].(string); !ok || got == "" {
		t.Errorf("last error header = %v, want non-empty string",
			publisher.headers[errorHeader])
	}

	if acker.ackCount != 1 {
		t.Errorf("ack count = %d, want 1", acker.ackCount)
	}

	if got := message.Headers[attemptHeader]; got != int32(0) {
		t.Errorf("original attempt header = %v, want int32(0)", got)
	}
}

func TestRetryDecisionMaxInt(t *testing.T) {
	maxInt := int(^uint(0) >> 1)

	queue, nextAttempt, delay, deadLetter := retryDecision(maxInt)

	if queue != deadQueue {
		t.Errorf("queue = %q, want %q", queue, deadQueue)
	}
	if nextAttempt != maxInt {
		t.Errorf("nextAttempt = %d, want %d", nextAttempt, maxInt)
	}
	if delay != 0 {
		t.Errorf("delay = %s, want 0", delay)
	}
	if !deadLetter {
		t.Error("deadLetter = false, want true")
	}
}

func TestReadAttemptEdgeCases(t *testing.T) {
	tests := []struct {
		name    string
		headers amqp.Table
		want    int
	}{
		{
			name:    "nil headers",
			headers: nil,
			want:    0,
		},
		{
			name:    "missing attempt header",
			headers: amqp.Table{},
			want:    0,
		},
		{
			name:    "int value",
			headers: amqp.Table{attemptHeader: 3},
			want:    3,
		},
		{
			name:    "int32 value",
			headers: amqp.Table{attemptHeader: int32(4)},
			want:    4,
		},
		{
			name:    "int64 value",
			headers: amqp.Table{attemptHeader: int64(5)},
			want:    5,
		},
		{
			name:    "numeric string",
			headers: amqp.Table{attemptHeader: "6"},
			want:    6,
		},
		{
			name:    "zero value",
			headers: amqp.Table{attemptHeader: 0},
			want:    0,
		},
		{
			name:    "negative int",
			headers: amqp.Table{attemptHeader: -1},
			want:    0,
		},
		{
			name:    "negative int32",
			headers: amqp.Table{attemptHeader: int32(-2)},
			want:    0,
		},
		{
			name:    "negative int64",
			headers: amqp.Table{attemptHeader: int64(-3)},
			want:    0,
		},
		{
			name:    "negative numeric string",
			headers: amqp.Table{attemptHeader: "-4"},
			want:    0,
		},
		{
			name:    "invalid numeric string",
			headers: amqp.Table{attemptHeader: "abc"},
			want:    0,
		},
		{
			name:    "empty string",
			headers: amqp.Table{attemptHeader: ""},
			want:    0,
		},
		{
			name:    "unsupported int16 type",
			headers: amqp.Table{attemptHeader: int16(7)},
			want:    0,
		},
		{
			name:    "unsupported float type",
			headers: amqp.Table{attemptHeader: float64(8)},
			want:    0,
		},
		{
			name:    "unsupported boolean type",
			headers: amqp.Table{attemptHeader: true},
			want:    0,
		},
		{
			name:    "nil attempt value",
			headers: amqp.Table{attemptHeader: nil},
			want:    0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := readAttempt(tt.headers)
			if got != tt.want {
				t.Errorf("readAttempt() = %d, want %d", got, tt.want)
			}
		})
	}
}
