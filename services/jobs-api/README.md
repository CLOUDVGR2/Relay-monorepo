# Relay Go Jobs API

**Runtime:** Go / Gin
**Responsibility:** internal job submission and status/worker-health HTTP contract. The authenticated user-facing job facade is provided by NestJS and the edge route `/jobs` maps to Nest, not directly to this Go process.

## 1. Architecture

The Go Jobs API validates supported job requests, publishes messages to RabbitMQ, exposes health endpoints, and provides job state/worker information through configured Redis/status integration. The Go Jobs Worker is a separate process and owns consumption/execution.

## 2. HTTP surface

| Method | Path | Purpose | Operational note |
|---|---|---|---|
| GET | `/healthz` | process liveness | local process response |
| GET | `/readyz` | service readiness | checks required dependencies |
| GET | `/rabbitmqz` | broker readiness | confirms publisher/broker availability |
| GET | `/worker-health` | worker heartbeat snapshot | depends on status/heartbeat configuration |
| POST | `/internal/v1/jobs` | submit supported job | internal bearer authentication |
| GET | `/internal/v1/jobs` | list/status query | internal contract; status store must be configured |
| GET | `/internal/v1/jobs/{id}` | inspect job | internal contract; status store must be configured |

Review `openapi.go`, route handlers, and configuration before relying on optional status routes in a specific deployment. The service is not a general arbitrary-code execution endpoint.

## 3. Message and execution model

The API publishes durable job messages to RabbitMQ. The worker uses the queue topology and supported job schema defined in the Go worker package. The current handler implementation includes a `welcome` job type. Do not document or expose additional job types until their handlers and contract tests exist.

The worker owns retries, dead-letter handling, idempotency coordination, and execution status behavior. The API acceptance response should not be represented as proof that a job has completed.

## 4. Security

- Internal routes require the configured internal bearer credential.
- Keep the Go API private behind internal service networking or an approved authenticated facade.
- Do not publish RabbitMQ credentials or job payload secrets in logs.
- Validate job type and payload server-side; do not permit arbitrary executable content.
- Ensure idempotency keys and job identifiers are scoped and retained appropriately.

## 5. Local development and tests

```bash
cd services/jobs-api
go test ./...
go vet ./...
go build ./...
```

The root Compose file wires the API to RabbitMQ and Redis. Use the service `.env.example` for variable names and keep local credentials untracked.

## 6. Operations

Monitor broker connection/publish failures, readiness, request latency, job acceptance, Redis status-store availability, worker heartbeat age, queue age, retry count, and DLQ volume. Correlate API submission IDs with worker message IDs. A healthy API with a stopped consumer can still accept work that never completes; alert on both producer and consumer state.
