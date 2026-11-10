# Relay Jobs Worker

## Overview

The Relay Jobs Worker is a Go background service that consumes asynchronous jobs from RabbitMQ and uses Redis for idempotency, job status coordination, and heartbeat monitoring.

It is a background consumer, not an HTTP API. It exposes no REST, GraphQL, Swagger UI, or OpenAPI endpoints.

## Responsibilities

- Consume and process supported RabbitMQ jobs.
- Track job status in Redis when a matching status record exists.
- Prevent duplicate processing with Redis locks and completion markers.
- Retry failed jobs using delayed queues.
- Route invalid and exhausted messages to a dead-letter queue.
- Reconnect after RabbitMQ session failures.
- Publish a Redis heartbeat and handle graceful shutdown.

## Dependencies and configuration

| Variable | Required | Description |
|---|---|---|
| `REDIS_URL` | Yes | Redis URL; supports `redis://` and `rediss://`. |
| `RABBITMQ_HOST` | No | RabbitMQ host and port; defaults to `localhost:5672`. |
| `RABBITMQ_DEFAULT_USER` | Yes | RabbitMQ username. |
| `RABBITMQ_DEFAULT_PASS` | Yes | RabbitMQ password. |

RabbitMQ credentials are URL-encoded when constructing the AMQP connection URL. Redis is pinged during startup.

For local development:

    export REDIS_URL=redis://localhost:6379
    export RABBITMQ_HOST=localhost:5672
    export RABBITMQ_DEFAULT_USER=admin
    export RABBITMQ_DEFAULT_PASS=your-local-rabbitmq-password
    go run .

## RabbitMQ topology and retry policy

| Queue | Purpose |
|---|---|
| `go.jobs` | Main queue |
| `go.jobs.retry.5s` | First retry |
| `go.jobs.retry.30s` | Second retry |
| `go.jobs.retry.120s` | Third retry |
| `go.jobs.retry.300s` | Fourth retry |
| `go.jobs.dlq` | Dead-letter queue |

Retry queues use message TTL and dead-letter routing back to `go.jobs`.

The maximum is five attempts, including the initial attempt:

- Attempt 1 failure: retry after 5 seconds.
- Attempt 2 failure: retry after 30 seconds.
- Attempt 3 failure: retry after 2 minutes.
- Attempt 4 failure: retry after 5 minutes.
- Attempt 5 failure: dead-letter the message.

Invalid JSON is sent directly to the dead-letter queue.

## Acknowledgements and publishing

The consumer uses manual acknowledgements and a prefetch count of one.

For retry and dead-letter handling, the worker waits for a RabbitMQ publisher confirmation before acknowledging the original delivery. Publications use persistent delivery mode and mandatory routing. Negative confirmations and unroutable returned messages are detected.

A publisher that encounters a failure is treated as unusable for the remainder of its session.

## Job format and processing

The worker decodes job messages into this structure:

    {
      "id": "job-123",
      "ownerId": "user-123",
      "type": "welcome",
      "message": "Welcome to Relay"
    }

| Field | Description |
|---|---|
| `id` | Required job identifier |
| `ownerId` | Optional owner identifier used to protect status updates |
| `type` | Job type |
| `message` | Message content required by the `welcome` job |

The currently implemented job type is `welcome`.

A welcome job requires a non-empty message. Unsupported job types and invalid job data are processing failures and follow the retry policy.

## Redis behavior

### Idempotency

The worker uses these Redis key patterns:

| Key | Purpose | Expiration |
|---|---|---|
| `go-worker:job:<id>:lock` | Processing lock | 1 minute |
| `go-worker:job:<id>:completed` | Completed-job marker | 30 days |
| `go-worker:heartbeat` | Worker heartbeat | 15 seconds |

A random token identifies each acquired lock. The worker releases the lock only when the stored token matches the invocation that acquired it.

Completed-job markers allow subsequent deliveries of the same job ID to be skipped. A job already being processed by another worker is reported as in progress and follows normal retry handling.

Idempotency is scoped by job ID. Producers must supply stable, appropriately unique job identifiers.

### Job status updates

Status updates are best-effort. The worker updates a status record only when:

- The job has both an ID and an owner ID.
- The Redis status record exists.
- Its stored `owner_id` matches the job's `ownerId`.

The worker records processing, retrying, completed, or failed status, with attempt counts and timestamps.

Status update failures are logged and do not themselves fail job processing.

### Heartbeat

While a RabbitMQ consumer session is active, the worker writes `go-worker:heartbeat` immediately and refreshes it every five seconds.

The key expires after 15 seconds without refresh. The worker also attempts to remove the key when its consumer session exits.

The heartbeat represents an active consumer session, not proof that a particular job has completed.

## Reconnection and lifecycle

RabbitMQ session failures are retried using bounded exponential backoff:

- Initial delay: 1 second.
- Maximum delay: 30 seconds.
- Delay doubles between retries until the maximum is reached.

The worker responds to `SIGINT` and `SIGTERM`.

During shutdown, it cancels the RabbitMQ consumer, handles deliveries already received, and drains available deliveries subject to a 30-second shutdown deadline.

Docker Compose configures a 35-second stop grace period.

## Docker Compose deployment

Run from the repository root:

    docker compose up -d --build jobs-worker

Inspect logs:

    docker compose logs -f jobs-worker

Check container state:

    docker compose ps jobs-worker

Restart:

    docker compose restart jobs-worker

The Compose service:

- Connects to Redis at `redis://redis:6379`.
- Connects to RabbitMQ at `rabbitmq:5672`.
- Waits for Redis and RabbitMQ health checks before startup.
- Uses a read-only container filesystem.
- Runs as a non-root user.
- Drops Linux capabilities.
- Enables `no-new-privileges`.
- Has a 256 MB memory limit and a 100-process limit.
- Uses a 35-second stop grace period.

The worker does not publish a host port.

## Source map

| File | Responsibility |
|---|---|
| `main.go` | Startup, signal handling, consumer lifecycle, shutdown |
| `config.go` | RabbitMQ connection URL construction |
| `rabbitmq.go` | RabbitMQ connections, channels, queues, consumer session |
| `handler.go` | Message decoding, acknowledgement, retries, dead-letter routing |
| `job.go` | Job model and supported job processing |
| `reliability.go` | Queue topology, retry decisions, reliable publisher |
| `idempotency.go` | Redis locks, completion markers, status updates |
| `redis.go` | Redis client initialization |
| `heartbeat.go` | Worker heartbeat lifecycle |
| `reconnect.go` | Reconnection backoff |
| `Dockerfile` | Multi-stage production image |

## Development and validation

Run from `services/jobs-worker`:

    go test ./...
    go test -race ./...
    go vet ./...
    go build ./...

Some tests use fakes or require explicit integration setup. Passing unit tests does not independently establish behavior against live RabbitMQ and Redis services.

The Dockerfile builds a static Go binary in a Go 1.27.3 Alpine build stage and runs it in Alpine 3.22 as an unprivileged user.

## Delivery guarantees and operational limitations

The worker does not provide an exactly-once delivery guarantee.

RabbitMQ delivery, Redis idempotency state, application side effects, status updates, and message acknowledgements are separate operations. Process crashes or dependency failures can occur between them.

In particular:

- A job may be delivered more than once.
- A completed marker can expire after 30 days.
- A processing lock can expire while a long-running operation is still active.
- A job side effect and its Redis completion marker are not one atomic transaction.
- A publisher confirmation does not make publishing and acknowledging the original delivery atomic.
- Job status updates are best-effort and are not a substitute for the actual processing result.
- Retry queues and the dead-letter queue require operational monitoring and appropriate retention policies.

Before production release, verify duplicate delivery, worker crashes around side effects and acknowledgements, retry exhaustion, poison messages, Redis outages, RabbitMQ reconnects, unroutable publications, and shutdown with in-flight deliveries.
