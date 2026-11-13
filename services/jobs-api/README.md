# Relay Go Jobs API

## Responsibility

The Jobs API is an internal Go HTTP service implemented with Gin. It accepts supported job requests, publishes persistent messages to RabbitMQ, stores job state in Redis, and exposes worker health information.

## HTTP contract

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| GET | `/healthz` | Process liveness | None |
| GET | `/rabbitmqz` | Publisher readiness | None |
| GET | `/readyz` | Required dependency readiness | None |
| GET | `/worker-health` | Worker heartbeat snapshot | None |
| POST | `/internal/v1/jobs` | Submit job | Internal bearer |
| GET | `/internal/v1/jobs` | Owner-scoped job history | Internal bearer |
| GET | `/internal/v1/jobs/:id` | Owner-scoped job detail | Internal bearer |

Internal routes require `Authorization: Bearer <INTERNAL_API_TOKEN>`. The calling service supplies `ownerId`; the API uses that value for owner-scoped status queries and does not derive an end-user identity from the internal token.

## Submission semantics

The request body is bounded to 64 KiB, rejects unknown fields and multiple JSON values, and currently supports the `welcome` job type. Successful publication returns `202 Accepted`; the broker publisher waits for a positive confirmation. A `202` confirms accepted publication, not completed processing.

Redis status creation and RabbitMQ publication are separate operations. The service records the initial queued state and attempts to mark publication failures accordingly.

## Worker observability

The API reads worker heartbeat state for the Go worker, recording worker, and multi-agent worker. Heartbeats are freshness-sensitive and distinguish missing, stale, malformed, or unavailable state.

## Development

```bash
go test ./...
go vet ./...
go build ./...
```

Run from `services/jobs-api/`. Swagger and OpenAPI routes are provided by the service's generated specification handlers.
