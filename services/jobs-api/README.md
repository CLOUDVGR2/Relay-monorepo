# Go Jobs API

## Purpose

The Go HTTP service exposes job-related operations, worker health/status endpoints, and middleware. It is implemented with Gin and has its own Go module.

## Source map

- `main.go` — process startup and route assembly.
- `job_status.go`, `job_status_handlers.go` — job-status model/handler responsibilities.
- `worker_health.go` — worker-health integration.
- `middleware.go` — HTTP middleware.
- `rabbitmq.go` — RabbitMQ integration.
- `*_test.go` — handler, middleware, health and startup tests.

Consult source for the exact route list and response contracts; this README intentionally does not infer routes from filenames.

## Configuration and dependencies

The service integrates with RabbitMQ and Redis. Environment variables are documented by `.env.example` and validated in source. Local Compose uses service DNS identities `rabbitmq` and `redis`, while the gateway targets the jobs API at `jobs-api:8081`.

## Development

```bash
cd services/jobs-api
go test ./...
go vet ./...
go build ./...
```

The module declares its own Go version. Use a compatible toolchain and run tests with required environment and infrastructure for integration scenarios.

## Reliability expectations

A response that a job was accepted must have a precise meaning. Verify queue publication semantics, error mapping, authorization for internal operations, state-transition rules, and correlation identifiers. Queue availability, worker liveness and job completion are distinct conditions. Do not claim durable acceptance unless the publisher/broker interaction and persistence model prove it.
