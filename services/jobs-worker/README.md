# Relay Go Jobs Worker

## Responsibility

The Go Jobs Worker is a background RabbitMQ consumer. It is not an HTTP service. It processes supported job messages and coordinates state, deduplication, retry, and heartbeat behavior through Redis and RabbitMQ.

## Processing lifecycle

1. Establish Redis and RabbitMQ connectivity.
2. Declare or validate the durable queue topology.
3. Consume with manual acknowledgement and bounded prefetch.
4. Decode and validate the job payload.
5. Acquire idempotency coordination for the job identifier.
6. Execute the supported job handler.
7. Persist status and completion marker where applicable.
8. Acknowledge the delivery only after required processing or confirmed retry/dead-letter publication.

## Queue topology

The implementation defines the main `go.jobs` queue, delayed retry queues (`go.jobs.retry.*`), and `go.jobs.dlq`. Retry queues use TTL and dead-letter routing back to the main queue. Malformed or exhausted messages are routed to the dead-letter path.

## Redis coordination

Redis stores processing locks, completion markers, job status coordination, and worker heartbeat data. TTLs bound transient coordination records. Status updates are owner-aware when the corresponding status record exists.

## Reliability behavior

The worker reconnects after RabbitMQ session failures, uses bounded retry delays, confirms retry/dead-letter publication before acknowledging the original delivery, and handles shutdown by stopping consumption and draining work within a deadline.

## Job contract

The currently implemented job type is `welcome`, with a required non-empty message. Unsupported types and malformed payloads follow the worker's failure policy.

## Development

```bash
go test ./...
go vet ./...
go build ./...
```

Run from `services/jobs-worker/`. Tests cover handlers, topology, reconnect behavior, idempotency, status updates, heartbeat, and shutdown.
