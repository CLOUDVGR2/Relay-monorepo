// Package main contains tests for handler test in the Relay jobs worker.

package main

import (
	"testing"

	amqp "github.com/rabbitmq/amqp091-go"
)

func TestReadAttempt(t *testing.T) {
	tests := []struct {
		name    string
		headers amqp.Table
		want    int
	}{
		{
			name:    "missing headers",
			headers: nil,
			want:    0,
		},
		{
			name:    "missing attempt",
			headers: amqp.Table{},
			want:    0,
		},
		{
			name:    "integer attempt",
			headers: amqp.Table{"x-attempt": int(2)},
			want:    2,
		},
		{
			name:    "int32 attempt",
			headers: amqp.Table{"x-attempt": int32(3)},
			want:    3,
		},
		{
			name:    "int64 attempt",
			headers: amqp.Table{"x-attempt": int64(4)},
			want:    4,
		},
		{
			name:    "string attempt",
			headers: amqp.Table{"x-attempt": "2"},
			want:    2,
		},
		{
			name:    "invalid string",
			headers: amqp.Table{"x-attempt": "invalid"},
			want:    0,
		},
		{
			name:    "negative attempt",
			headers: amqp.Table{"x-attempt": int32(-1)},
			want:    0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := readAttempt(tt.headers)

			if got != tt.want {
				t.Errorf("readAttempt() = %d, want %d",
					got, tt.want)
			}
		})
	}
}
