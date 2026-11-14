# Performance and Resource Engineering

**Audience:** service owners, performance engineers, platform teams, and technical reviewers. This document defines a measurement method; it does not claim benchmark results. The repository's `tests/performance/` directory currently defines a scenario contract rather than a complete executable load-test suite.

## 1. Performance principles

1. Measure user-visible outcomes at the edge and service-level work at each boundary.
2. Separate latency, throughput, saturation, and correctness.
3. Use representative datasets, realistic concurrency, and production-like limits.
4. Optimize the dominant measured cost, not the most visible implementation detail.
5. Preserve security, isolation, and correctness while tuning.
6. Tie every reported result to a commit, image, runtime, configuration, dataset, and test script.

## 2. Critical paths

| Path | Main cost centers | Key measurements |
|---|---|---|
| Web request | browser, NGINX, Gateway, Express/Nest, DB/cache | edge latency, upstream time, payload size, error rate |
| Mobile request | device network, API client, Gateway, service | cold/warm request latency, retry behavior, payload size |
| Realtime | Socket.IO handshake, room operations, Redis, persistence | connect time, reconnect rate, event delivery/ack delay, concurrent sockets |
| GraphQL | resolver fan-out, Prisma queries, pagination | operation latency, DB query count, depth/complexity, response bytes |
| Knowledge answer | query embedding, vector search, full-text search, generation | embedding latency, retrieval latency, candidates, model latency, total answer latency |
| Document ingestion | validation, chunking, embeddings, DB writes | ingest duration by size, chunk count, embedding failures, storage use |
| Jobs | publish, broker wait, worker processing, Redis coordination | queue age, acceptance latency, service time, retry rate, throughput |
| Recording | capture, upload, object storage, transcription/summary | upload bytes/sec, completion rate, processing duration, worker memory |

## 3. Resource controls already present

Repository implementations include several bounded-resource patterns:

- HTTP body limits and request deadlines in Node services and adapters;
- configured Go transport and proxy timeouts;
- bounded GraphQL pagination and DTO validation;
- bounded worker prefetch and message acknowledgement behavior;
- Redis-backed idempotency and worker heartbeat/state;
- Python AI request validation and model generation token/time limits;
- container memory and process limits in the Compose topology;
- non-root runtime users and read-only/capability restrictions for selected containers;
- NGINX proxy timeouts and WebSocket upgrade configuration.

These controls reduce risk but do not prove capacity under production load. Review actual values per environment.

## 4. Benchmark methodology

Every benchmark report should include:

| Field | Required content |
|---|---|
| Build | commit SHA, image digest, dependency lockfile digest |
| Environment | CPU/memory, OS/kernel, network, storage, runtime versions, topology |
| Configuration | replica count, worker concurrency, pools, timeouts, model, token caps |
| Dataset | size, distribution, data-generation method, privacy treatment |
| Workload | operations, concurrency, ramp, duration, arrival model, think time |
| Results | p50/p90/p95/p99, throughput, errors, saturation, cost where measured |
| Validity | warm-up, steady-state interval, repetitions, variance, exclusions |
| Interpretation | bottleneck, risk, trade-off, next experiment |

Avoid reporting one run or a synthetic local result as a production capacity guarantee.

## 5. Workload scenarios

Build a representative workload matrix for:

- authentication and session validation;
- message send/read and conversation-history pagination;
- GraphQL conversation/task/call queries and mutations;
- Socket.IO connection churn, concurrent connections, and message fan-out;
- job submission, queue throughput, retry, and worker restart recovery;
- document ingestion at small, median, and maximum accepted size;
- RAG query mixes: vector-dominant, keyword-dominant, empty results, and large corpus;
- LLM provider latency, token usage, cancellation, and timeout;
- recording upload concurrency, large objects, partial failure, and retry;
- simultaneous background workers and user-facing traffic.

Test both steady state and failure conditions: slow database, unavailable broker, provider rate limiting, object-store latency, worker restart, and network loss.

## 6. Database performance

### PostgreSQL and pgvector

- Inspect query plans for vector and text retrieval at realistic corpus sizes.
- Verify the vector index and operator class before assuming nearest-neighbor behavior is index-backed; the deployed index type and migration state must be inspected.
- Validate the full-text GIN index and `search_vector` generated expression.
- Measure connection-pool wait separately from query execution.
- Avoid cross-tenant retrieval assumptions in query plans: current Knowledge Base search intentionally uses a shared corpus path across tenant IDs, while document management routes remain tenant-scoped.
- Track embedding dimensions and provider consistency; current retrieval contract expects 768 dimensions.

### MongoDB

- Inspect indexes for user lookup and document models before increasing read concurrency.
- Track pool saturation and query latency.
- Review Socket.IO and notification access patterns under concurrent load.

### Redis and RabbitMQ

- Measure latency and memory headroom, not just availability.
- Track queue age and redelivery/retry behavior; queue depth alone can hide old poison messages.
- Exercise reconnect and broker restart behavior.

## 7. AI performance and quality

Latency is not the only optimization target. Record:

- query embedding time;
- vector and keyword query duration;
- candidate and selected chunk counts;
- generation time and tokens;
- total answer latency;
- abstention rate, citation validity, and sampled factual quality.

Optimize prompt size and retrieval top-k only after quality testing. Caching must respect user access, document visibility, model version, embedding version, and prompt version. A shared Knowledge Base retrieval result must not be cached under an incorrectly user-private key or vice versa.

## 8. Capacity planning

Model each service as a bounded queue with arrival rate, service rate, concurrency, and finite resources. Identify the saturation point before queue growth becomes unstable. Include dependency quotas (LLM, object storage, databases) in the capacity model.

Production capacity planning should include:

- normal, peak, and burst traffic;
- deployment surge and rolling replacement capacity;
- failover capacity after loss of an availability zone or worker pool;
- database growth, object retention, and embedding growth;
- model provider quota and cost controls;
- autoscaling signals and minimum/maximum replicas;
- operational headroom for recovery and maintenance.

## 9. Performance acceptance

A release should not be accepted based only on a build passing. Require performance comparison for material changes to hot paths, data access, serialization, model calls, queues, and connection handling. Set regression thresholds only after a stable baseline exists.

## Related documents

- [Performance test contract](../../tests/performance/README.md)
- [Observability](../observability.md)
- [Reliability objectives](../reliability/slo-and-error-budgets.md)
