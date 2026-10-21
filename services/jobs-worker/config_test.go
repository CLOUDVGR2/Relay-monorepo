// Package main contains tests for config test in the Relay jobs worker.

package main

import (
	"testing"
)

func TestRabbitMQURLFromEnvDefaultsHost(t *testing.T) {
	t.Setenv("RABBITMQ_HOST", "")
	t.Setenv("RABBITMQ_DEFAULT_USER", "worker")
	t.Setenv("RABBITMQ_DEFAULT_PASS", "secret")

	got, err := rabbitMQURLFromEnv()
	if err != nil {
		t.Fatalf("rabbitMQURLFromEnv() error = %v", err)
	}

	want := "amqp://worker:secret@localhost:5672"
	if got != want {
		t.Fatalf("rabbitMQURLFromEnv() = %q, want %q", got, want)
	}
}

func TestRabbitMQURLFromEnvCustomHost(t *testing.T) {
	t.Setenv("RABBITMQ_HOST", "rabbitmq:5672")
	t.Setenv("RABBITMQ_DEFAULT_USER", "worker")
	t.Setenv("RABBITMQ_DEFAULT_PASS", "secret")

	got, err := rabbitMQURLFromEnv()
	if err != nil {
		t.Fatalf("rabbitMQURLFromEnv() error = %v", err)
	}

	want := "amqp://worker:secret@rabbitmq:5672"
	if got != want {
		t.Fatalf("rabbitMQURLFromEnv() = %q, want %q", got, want)
	}
}

func TestRabbitMQURLFromEnvMissingCredentials(t *testing.T) {
	tests := []struct {
		name string
		user string
		pass string
	}{
		{name: "missing username", user: "", pass: "secret"},
		{name: "missing password", user: "worker", pass: ""},
		{name: "missing both", user: "", pass: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("RABBITMQ_HOST", "")
			t.Setenv("RABBITMQ_DEFAULT_USER", tt.user)
			t.Setenv("RABBITMQ_DEFAULT_PASS", tt.pass)

			got, err := rabbitMQURLFromEnv()
			if err == nil {
				t.Fatalf("rabbitMQURLFromEnv() = %q, want error", got)
			}
		})
	}
}
