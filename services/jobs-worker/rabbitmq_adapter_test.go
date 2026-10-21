// Package main contains tests for rabbitmq adapter test in the Relay jobs worker.

package main

import (
	"errors"
	"testing"

	amqp "github.com/rabbitmq/amqp091-go"
)

type fakeAMQPConnection struct {
	channel    *amqp.Channel
	channelErr error
	closeErr   error
	closeCalls int
}

func (c *fakeAMQPConnection) Channel() (*amqp.Channel, error) {
	return c.channel, c.channelErr
}

func (c *fakeAMQPConnection) Close() error {
	c.closeCalls++
	return c.closeErr
}

func TestAMQPRabbitMQConnectionChannelError(t *testing.T) {
	wantErr := errors.New("channel creation failed")

	conn := &amqpRabbitMQConnection{
		conn: &fakeAMQPConnection{
			channelErr: wantErr,
		},
	}

	channel, err := conn.Channel()

	if !errors.Is(err, wantErr) {
		t.Fatalf("Channel() error = %v, want %v", err, wantErr)
	}

	if channel != nil {
		t.Fatal("Channel() returned a channel on error")
	}
}

func TestAMQPRabbitMQConnectionChannelSuccess(t *testing.T) {
	fakeChannel := &amqp.Channel{}

	conn := &amqpRabbitMQConnection{
		conn: &fakeAMQPConnection{
			channel: fakeChannel,
		},
	}

	channel, err := conn.Channel()
	if err != nil {
		t.Fatalf("Channel() error = %v, want nil", err)
	}

	if channel == nil {
		t.Fatal("Channel() returned nil, want a channel")
	}
}

func TestAMQPRabbitMQConnectionClose(t *testing.T) {
	wantErr := errors.New("connection close failed")
	fake := &fakeAMQPConnection{
		closeErr: wantErr,
	}

	conn := &amqpRabbitMQConnection{
		conn: fake,
	}

	err := conn.Close()

	if !errors.Is(err, wantErr) {
		t.Fatalf("Close() error = %v, want %v", err, wantErr)
	}

	if fake.closeCalls != 1 {
		t.Fatalf(
			"underlying Close() calls = %d, want 1",
			fake.closeCalls,
		)
	}
}

func TestDialRabbitMQ_Success(t *testing.T) {
	fake := &fakeAMQPConnection{}
	originalDial := dialAMQPConnection
	t.Cleanup(func() {
		dialAMQPConnection = originalDial
	})

	dialAMQPConnection = func(url string) (amqpConnection, error) {
		if url != "amqp://test" {
			t.Fatalf("dial URL = %q, want %q", url, "amqp://test")
		}
		return fake, nil
	}

	conn, err := dialRabbitMQ("amqp://test")
	if err != nil {
		t.Fatalf("dialRabbitMQ() error = %v", err)
	}
	if conn == nil {
		t.Fatal("dialRabbitMQ() returned nil connection")
	}

	if err := conn.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if fake.closeCalls != 1 {
		t.Fatalf("Close() called %d times, want 1", fake.closeCalls)
	}
}
