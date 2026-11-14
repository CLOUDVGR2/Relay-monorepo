# Relay Go Jobs Worker

**Runtime:** Go
**Responsibility:** consume RabbitMQ job messages and execute the supported job handlers with reliability controls. It is a background process, not a public HTTP API.

## 1. Processing lifecycle

The worker:

1. loads validated configuration;
2. establishes Redis and RabbitMQ connectivity;
3. declares or validates durable queue topology;
4. consumes with bounded prefetch and manual acknowledgement;
5. decodes and validates the job message;
6. coordinates idempotency/status using Redis;
7. invokes the supported handler;
8. acknowledges successful work or applies retry/dead-letter policy;
9. updates heartbeat and status information;
10. drains and shuts down gracefully when signaled.

The current `job.go` handler set includes the `welcome` job type. Expand the catalog only with a schema, handler, idempotency strategy, retry classification, tests, and operational owner.

## 2. Reliability controls

- **Manual acknowledgement:** messages are not acknowledged before the relevant execution outcome is known.
- **Bounded prefetch:** controls in-flight work and memory pressure.
- **Idempotency:** repeated delivery must not repeat a non-idempotent effect when a reliable key/record exists.
- **Retry and DLQ:** transient failures may be retried; poison/permanent failures should reach a diagnosable dead-letter path.
- **Reconnect:** broker/cache reconnect behavior is tested and bounded.
- **Heartbeat:** exposes worker activity to the Jobs API/operations plane.
- **Graceful shutdown:** stop accepting new work, finish or safely release in-flight work, and close dependencies.

At-least-once delivery is the safe assumption for RabbitMQ consumer designs unless stronger end-to-end guarantees are proven. Idempotency reduces duplicate side effects; it does not turn the queue into a globally exactly-once system.

## 3. Queue topology

The implementation uses the `go.jobs` queue, retry queues named under `go.jobs.retry.*`, and a dead-letter route under `go.jobs.dlq`. Verify exchange, routing key, TTL, delivery mode, and dead-letter policy in the current queue declaration code when operating or changing the topology.

## 4. Configuration and local testing

Configuration is loaded from the worker's environment and validated at startup. Use Compose for a representative Redis/RabbitMQ test environment.

```bash
cd services/jobs-worker
go test ./... -count=1
go test -race ./... -count=1
go vet ./...
go build ./...
```

## 5. Operational dashboards and alerts

Track:

- queue depth and oldest message age;
- ready/unacked counts and consumer count;
- job success/failure and execution duration by bounded type;
- retry and DLQ rates;
- Redis idempotency/status errors;
- heartbeat age and worker restarts;
- reconnect and shutdown duration;
- CPU/memory and concurrency saturation.

Never use job payload content, user identifiers, or full job IDs as Prometheus labels. Put individual identifiers in appropriately protected logs.

## 6. Change checklist

- [ ] Schema/version compatibility with producers.
- [ ] Handler idempotency and side-effect semantics.
- [ ] Retryability classification and maximum attempts.
- [ ] DLQ inspection and replay process.
- [ ] Bounded concurrency and resource profile.
- [ ] Failure/reconnect/shutdown tests.
- [ ] Status and heartbeat observability.
- [ ] Runbook and supported job catalog updated.
