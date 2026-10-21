# Performance, CPU and memory engineering

## 1. Principles

Optimize measured bottlenecks, not aesthetics. Every optimization must preserve correctness, security and cancellation semantics. Keep a reproducible baseline, workload description, environment details, commit SHA, resource limits and raw results with each performance change.

## 2. Work bounds by layer

| Layer | Required bounds / controls | What to measure |
|---|---|---|
| HTTP ingress | header/body limits, request deadline, connection limits, rate limit | RPS, rejected requests, p50/p95/p99, open connections |
| Node.js | event-loop delay, bounded payloads, stream large data, avoid synchronous hot-path work | event-loop utilization, heap/RSS, GC pause, CPU profile |
| Go | deadlines, connection pool caps, bounded channels, bounded goroutine fan-out, cancellation | allocations/op, heap, goroutines, GC, block/mutex profiles |
| Python/AI | bounded concurrent model calls, async I/O, prompt/context/token limits, parser limits, bounded metric samples | RSS, event-loop lag, task count, provider latency/tokens, retrieval latency |
| Database | query deadline, pool max, indexes, pagination, transaction scope | pool wait, query p95, rows scanned/returned, locks |
| Queue | prefetch, max attempts, payload cap, bounded worker concurrency | queue depth/age, throughput, redelivery, retry/DLQ counts |
| Browser | code splitting, image budgets, cache headers, no duplicate heavy bundles | bundle size, LCP/INP/CLS, memory under long sessions |

A memory cap without an explicit workload and headroom can cause OOM loops. A CPU limit can throttle tail latency. Derive requests and limits from load tests plus peak multipliers and startup behavior, not copied defaults.

## 3. CPU/memory budgets

For each service, record:
- baseline idle and steady-state CPU, RSS/working set, heap, goroutines/threads and open sockets;
- peak resource use at expected peak concurrency and at 1.5–2x burst load;
- p95/p99 latency and error rate at each load point;
- memory growth during a soak test and after forced garbage collection where applicable;
- startup/warmup cost, including Prisma engines, Python imports, embeddings/model clients and caches;
- resource behavior during dependency degradation, not just healthy steady state.

Target at least 30% memory headroom under expected peak until data justifies a different budget. Avoid treating garbage-collector tuning as a substitute for bounding retained data. Any GC tuning must be benchmarked with the actual container limit and runtime version.

## 4. Performance test protocol

1. Pin a commit, dependency lockfiles, image digests, runtime version and resource limits.
2. Use representative request mix, payload size, authenticated user distribution, database cardinality, cache hit ratio and AI token lengths.
3. Warm up, then run a steady-state test long enough to expose pooling/GC behavior; run a separate burst and soak test.
4. Report throughput, p50/p95/p99, error rate, CPU, RSS, allocation/GC, queue age, DB pool wait and provider spend.
5. Compare identical environments; require no correctness regression and a meaningful improvement beyond run-to-run noise.
6. Include graceful overload and recovery: traffic must shed predictably and return to baseline without manual restarts.

## 5. Profiling recipes

### Go

- CPU/heap/allocations: write focused benchmarks and run `go test -bench=. -benchmem ./...`.
- Use `pprof` only on a controlled environment and bind diagnostic endpoints to loopback or an authenticated private listener.
- Run `go test -race ./...` for concurrency-sensitive paths; race-detector numbers are not performance numbers.

### Node.js

- Use `node --cpu-prof` for representative traffic; inspect event-loop delay and heap snapshots from a controlled environment.
- Heap snapshots can contain credentials and user content. Restrict access and destroy them after analysis.
- Do not increase worker/process count until DB pool, queue and downstream concurrency are accounted for.

### Python

- Profile CPU and allocation-heavy paths separately from remote provider wait time.
- Keep CPU-bound parsing/chunking away from the async event loop when benchmarks show blocking; bound thread/process pools.
- Use bounded metric samples and fixed-cardinality labels. Never label metrics by raw URL, user, document, prompt or exception string.

## 6. Current code-level note

The AI service's request metrics middleware previously attempted a linear scan of all registered routes when a route template was unavailable. That fallback is removed: it uses router metadata when available and the bounded `unmatched` label otherwise. This avoids route-count-proportional CPU work on the request completion path and prevents accidental high-cardinality labels.

## 7. Performance exit criteria

Do not publish a numeric CPU or memory improvement without before/after measurements. For production candidate status, attach load and soak reports, resource sizing rationale, identified bottlenecks, saturation behavior and a rollback trigger. See `tests/performance/README.md` for the load-test harness contract.
