# Relay Jobs API

The Relay Jobs API is an internal Go HTTP service built with Gin. It accepts supported background jobs, publishes them to RabbitMQ, stores job status and history in Redis, and reports dependency and worker health.

## API documentation

When running locally:

- Swagger UI: http://localhost:8083/docs
- OpenAPI JSON: http://localhost:8083/openapi.json

The OpenAPI document describes production routes, request and response schemas, status codes, and internal bearer authentication.

## Routes

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| GET | `/healthz` | HTTP process liveness | None |
| GET | `/rabbitmqz` | RabbitMQ publisher readiness | None |
| GET | `/readyz` | Required dependency readiness | None |
| GET | `/worker-health` | Worker heartbeat snapshot | None |
| POST | `/internal/v1/jobs` | Submit a supported job | Internal bearer token |
| GET | `/internal/v1/jobs` | List an owner's job history | Internal bearer token |
| GET | `/internal/v1/jobs/:id` | Retrieve a job status | Internal bearer token |

All `/internal/v1` routes require:

`Authorization: Bearer <INTERNAL_API_TOKEN>`

The bearer token authenticates the calling service. The `ownerId` query parameter used for history and detail lookups is supplied by that caller; the API does not derive an end-user identity from the bearer token.

## Health and readiness

- `/healthz` confirms that the HTTP process responds. It does not verify downstream dependencies.
- `/rabbitmqz` reports whether the RabbitMQ publisher connection and channel are ready.
- `/readyz` requires a ready publisher, an initialized Redis status store, and a readable Go worker heartbeat in the production configuration.
- `/worker-health` reports heartbeat information for `go-worker`, `recording-worker`, and `multi-agent-worker`.

Worker heartbeats older than 15 seconds are reported as stale. Missing, malformed, or unreadable heartbeat data is represented separately. The worker-health endpoint is not protected by the internal bearer middleware.

## Job submission

`POST /internal/v1/jobs` accepts:

| Field | Required | Description |
|---|---|---|
| `type` | Yes | Currently only `welcome` is supported. |
| `message` | Yes | Non-empty message, maximum 10,000 bytes. |
| `id` | No | Caller-supplied ID, maximum 128 characters. Generated when omitted. |
| `ownerId` | Production | Required when the Redis status store is enabled. |

The request body is limited to 64 KiB. Unknown JSON fields and additional JSON values after the request object are rejected.

Successful submissions return HTTP `202 Accepted` with the job ID and `queued` status. Messages are published to the durable RabbitMQ queue `go.jobs` as persistent JSON messages. The publisher waits for a positive broker confirmation.

When Redis status storage is enabled, the API creates the initial queued status before publishing. If publication fails, it attempts to mark the status as failed. Redis status creation and RabbitMQ publication are separate operations, not an atomic transaction.

A `202 Accepted` response means the broker confirmed publication; it does not mean a worker has completed the job.

## Job history and status

`GET /internal/v1/jobs` requires the `ownerId` query parameter. The optional `limit` defaults to 50 and accepts values from 1 through 100. Results are returned newest first.

`GET /internal/v1/jobs/:id` requires the job ID and `ownerId`. A job not found for that owner returns `404`.

Job status records and owner history indexes are retained in Redis for 30 days.

Status responses include `id`, `type`, `status`, `attempt`, `createdAt`, `updatedAt`, and optional `error`.

## Configuration

| Variable | Required | Default / example | Purpose |
|---|---|---|---|
| `PORT` | No | `8081` | HTTP listening port. |
| `INTERNAL_API_TOKEN` | Yes | No default | Shared bearer token for internal routes. |
| `REDIS_URL` | Yes | `redis://localhost:6379` | Redis connection URL. |
| `RABBITMQ_HOST` | Yes in practice | `localhost:5672` | RabbitMQ host and port. |
| `RABBITMQ_DEFAULT_USER` | Yes | Local development username | RabbitMQ username. |
| `RABBITMQ_DEFAULT_PASS` | Yes | Local development password | RabbitMQ password. |
| `CLIENT_URL` | No | Local frontend origins | Comma-separated CORS allowed origins. |

The service validates its Redis connection and establishes its RabbitMQ publisher during startup. Do not commit real credentials. Use the repository root `.env` for Docker Compose configuration.

## Docker Compose

The root `compose.yaml` defines the `jobs-api` service.

- Container port: `8081`
- Host binding: `127.0.0.1:8083`
- Redis address: `redis:6379`
- RabbitMQ address: `rabbitmq:5672`
- Compose startup dependencies: healthy Redis and RabbitMQ services
- Container healthcheck: `GET /readyz`

Other Compose services should use `http://jobs-api:8081` rather than the host-mapped address.

From the repository root:

`docker compose up -d --build jobs-api`

Inspect logs:

`docker compose logs -f jobs-api`

## Source map

- `main.go` — startup, configuration, HTTP server, route assembly, and job submission.
- `openapi.go` — OpenAPI specification and Swagger UI handler.
- `job_status.go` — Redis job status model and storage operations.
- `job_status_handlers.go` — job history and detail handlers.
- `worker_health.go` — worker heartbeat checks and snapshots.
- `middleware.go` — request IDs, access logging, and CORS.
- `rabbitmq.go` — durable queue declaration, persistent publication, publisher confirmations, and reconnection.
- `*_test.go` — handler, status, middleware, worker-health, and OpenAPI tests.

## Development and validation

Run from this directory with a Go toolchain compatible with the module's declared Go version:

- `go test ./...`
- `go vet ./...`
- `go build ./...`
