# Go Jobs Worker

## Purpose

The worker consumes asynchronous work from RabbitMQ and integrates with Redis for selected status, coordination and idempotency behavior. The implementation includes reconnect, heartbeat, reliability and shutdown paths.

## Source map

- `main.go`, `config.go` — startup and configuration.
- `rabbitmq.go`, `rabbitmq_adapter_test.go` — broker connection and adapter behavior.
- `handler.go`, `job.go` — job handling and execution.
- `idempotency.go`, `idempotency_status_test.go` and related tests — duplicate-work controls.
- `reconnect.go`, `heartbeat.go`, `shutdown_test.go` — lifecycle behavior.
- `reliability.go` and related tests — delivery/retry reliability paths.
- `redis.go` — Redis integration.

Exact queue names, acknowledgement timing, retry limits and dead-letter semantics must be read from source and runtime configuration.

## Development

```bash
cd services/jobs-worker
go test ./...
go test -race ./...
go vet ./...
go build ./...
```

Some tests require RabbitMQ/Redis or explicit integration flags. A suite that skips integration scenarios is not proof of broker-level behavior.

## Delivery guarantees

Do not describe the worker as exactly-once. RabbitMQ delivery, application side effects, Redis idempotency state and acknowledgement are separate operations with crash windows. Before release, verify duplicate delivery, process crash before/after side effects, broker reconnect, retry exhaustion, poison messages, status-store failure, and shutdown with in-flight work. Idempotency keys must be scoped, retained and reconciled according to the business operation they protect.
