// Package main contains tests for reliability topology test in the Relay jobs worker.

package main

import (
	"errors"
	"fmt"
	"strings"
	"testing"

	amqp "github.com/rabbitmq/amqp091-go"
)

type topologyDeclaration struct {
	name       string
	durable    bool
	autoDelete bool
	exclusive  bool
	noWait     bool
	args       amqp.Table
}

type fakeReliabilityTopologyChannel struct {
	declarations []topologyDeclaration
	failAtCall   int
	failErr      error
}

func (f *fakeReliabilityTopologyChannel) QueueDeclare(
	name string,
	durable bool,
	autoDelete bool,
	exclusive bool,
	noWait bool,
	args amqp.Table,
) (amqp.Queue, error) {
	f.declarations = append(f.declarations, topologyDeclaration{
		name:       name,
		durable:    durable,
		autoDelete: autoDelete,
		exclusive:  exclusive,
		noWait:     noWait,
		args:       args,
	})

	if f.failAtCall == len(f.declarations) {
		return amqp.Queue{}, f.failErr
	}

	return amqp.Queue{Name: name}, nil
}

func TestDeclareReliabilityTopologySuccess(t *testing.T) {
	fake := &fakeReliabilityTopologyChannel{}

	err := declareReliabilityTopologyWithChannel(fake)
	if err != nil {
		t.Fatalf("declareReliabilityTopologyWithChannel() error = %v", err)
	}

	wantCount := 1 + len(retryDelays)
	if len(fake.declarations) != wantCount {
		t.Fatalf(
			"declaration count = %d, want %d",
			len(fake.declarations),
			wantCount,
		)
	}

	if got := fake.declarations[0].name; got != deadQueue {
		t.Fatalf("first queue = %q, want %q", got, deadQueue)
	}

	for i, delay := range retryDelays {
		declaration := fake.declarations[i+1]

		if want := retryQueueName(delay); declaration.name != want {
			t.Errorf("queue %d = %q, want %q", i+1, declaration.name, want)
		}

		if got := declaration.args["x-message-ttl"]; got != int32(delay.Milliseconds()) {
			t.Errorf(
				"TTL for %s = %v, want %d",
				declaration.name,
				got,
				delay.Milliseconds(),
			)
		}

		if got := declaration.args["x-dead-letter-exchange"]; got != "" {
			t.Errorf("dead-letter exchange for %s = %v, want empty exchange", declaration.name, got)
		}

		if got := declaration.args["x-dead-letter-routing-key"]; got != mainQueue {
			t.Errorf(
				"dead-letter routing key for %s = %v, want %s",
				declaration.name,
				got,
				mainQueue,
			)
		}
	}

	for _, declaration := range fake.declarations {
		if !declaration.durable {
			t.Errorf("queue %s should be durable", declaration.name)
		}
		if declaration.autoDelete || declaration.exclusive || declaration.noWait {
			t.Errorf("queue %s has unexpected declaration flags", declaration.name)
		}
	}
}

func TestDeclareReliabilityTopologyDeadLetterQueueFailure(t *testing.T) {
	wantErr := errors.New("simulated dead-letter queue failure")

	fake := &fakeReliabilityTopologyChannel{
		failAtCall: 1,
		failErr:    wantErr,
	}

	err := declareReliabilityTopologyWithChannel(fake)

	if err == nil {
		t.Fatal("expected an error")
	}
	if !errors.Is(err, wantErr) {
		t.Fatalf("error = %v, want wrapped error %v", err, wantErr)
	}
	if !strings.Contains(err.Error(), "declare dead-letter queue") {
		t.Fatalf("unexpected error context: %v", err)
	}
	if len(fake.declarations) != 1 {
		t.Fatalf("declaration count = %d, want 1", len(fake.declarations))
	}
}

func TestDeclareReliabilityTopologyRetryQueueFailure(t *testing.T) {
	wantErr := errors.New("simulated retry queue failure")

	fake := &fakeReliabilityTopologyChannel{
		// Call 1 declares the DLQ; call 2 declares the first retry queue.
		failAtCall: 2,
		failErr:    wantErr,
	}

	err := declareReliabilityTopologyWithChannel(fake)

	if err == nil {
		t.Fatal("expected an error")
	}
	if !errors.Is(err, wantErr) {
		t.Fatalf("error = %v, want wrapped error %v", err, wantErr)
	}

	wantQueue := retryQueueName(retryDelays[0])
	wantContext := fmt.Sprintf("declare retry queue for %s", retryDelays[0])
	if !strings.Contains(err.Error(), wantContext) {
		t.Fatalf("error = %v, want context %q", err, wantContext)
	}

	if got := fake.declarations[1].name; got != wantQueue {
		t.Fatalf("failed queue = %q, want %q", got, wantQueue)
	}

	if len(fake.declarations) != 2 {
		t.Fatalf("declaration count = %d, want 2", len(fake.declarations))
	}
}

func TestDeclareReliabilityTopologyWrapper(t *testing.T) {
	fake := &fakeReliabilityTopologyChannel{}

	err := declareReliabilityTopology(fake)
	if err != nil {
		t.Fatalf("declareReliabilityTopology() error = %v", err)
	}

	wantCount := 1 + len(retryDelays)
	if got := len(fake.declarations); got != wantCount {
		t.Fatalf("declaration count = %d, want %d", got, wantCount)
	}
}
