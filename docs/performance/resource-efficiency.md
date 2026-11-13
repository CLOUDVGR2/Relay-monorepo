# Performance and Resource Engineering

## Performance model

Relay's critical paths span browser/mobile request handling, API routing, database access, realtime transport, queue processing, object storage, and model-provider calls. Measure each boundary independently and correlate with request IDs or durable job identifiers.

## Resource controls

| Layer | Primary controls |
|---|---|
| HTTP | Request body limits, deadlines, bounded connection pools, route-specific concurrency |
| GraphQL | Query complexity/depth controls, bounded pagination, DTO validation |
| Realtime | Connection lifecycle, room membership, event payload bounds |
| Database | Connection pool limits, indexes, query plans, pagination |
| RabbitMQ | Prefetch, durable topology, retry ceilings, dead-letter routing |
| Redis | Key TTLs, bounded data structures, connection pool, memory policy |
| AI | Prompt/token budget, retrieval top-k, provider timeout, concurrency, model selection |
| Workers | Job lease, heartbeat, attempt cap, bounded shutdown and memory |
| Mobile | Audio lifecycle, local cache bounds, upload retry discipline, background execution policy |

## Measurement protocol

1. Define workload shape, concurrency, payload size, data volume, and target environment.
2. Capture baseline p50/p95/p99 latency, throughput, error rate, CPU, memory, queue age, and database utilization.
3. Change one variable at a time.
4. Repeat enough runs to distinguish signal from variance.
5. Profile the hot path and correlate application traces with infrastructure metrics.
6. Record the exact commit, configuration, and test data.

## Service profiling

- Go: use `go test -bench`, `pprof`, runtime metrics, goroutine profiles, and heap profiles.
- Node.js: inspect event-loop delay, CPU profiles, heap snapshots, GC behavior, and connection-pool wait.
- Python: profile synchronous CPU hotspots and async I/O waits; measure provider latency separately.
- PostgreSQL: use query plans, `pg_stat_statements`, lock and pool metrics.
- RabbitMQ: monitor queue depth, unacked deliveries, publish confirms, consumer count, and redelivery.

## Acceptance criteria

Performance acceptance should define workload-specific latency, throughput, resource ceilings, and error thresholds. Do not publish generic capacity claims without a reproducible workload profile and measured environment.
