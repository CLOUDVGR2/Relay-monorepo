# Performance test contract

This directory defines the performance evidence expected before tuning or production claims. Keep load tests opt-in and target only an environment you own; do not run against production without a change window and explicit capacity approval.

## Required scenario matrix

1. **Baseline:** representative authenticated API traffic at expected average load.
2. **Peak:** expected peak concurrency and request mix.
3. **Burst:** 1.5–2x expected peak for a short, bounded interval.
4. **Soak:** steady representative traffic long enough to reveal memory growth, pool leaks, queue accumulation and GC behavior.
5. **Degradation:** inject a slow/unavailable dependency and verify bounded latency, concurrency and error response.
6. **Recovery:** restore dependency and verify queue drain, latency and resource use return to baseline without manual restart.

## Required report fields

- commit SHA, image digest, runtime/dependency versions;
- target environment, CPU/memory limits, replica count and dependency topology;
- workload mix, payload sizes, concurrency, duration and warm-up period;
- throughput, p50/p95/p99 latency, HTTP status/error rate and timeout rate;
- CPU, RSS/working set, heap/allocations/GC, event-loop delay, open connections;
- database pool wait/query latency, queue depth/age/retries and provider latency/token spend;
- saturation point, overload behavior, recovery time and known confounders.

## Suggested tools

- k6 or Locust for HTTP load and thresholds;
- Go `testing.B`, `-benchmem`, `pprof` for Go hot paths;
- Node `--cpu-prof`, heap snapshots and event-loop delay for Node;
- `py-spy` / `cProfile` and allocation profiling for Python;
- database-native slow query / pool metrics and broker queue metrics.

No benchmark result is valid without a representative workload and resource limits. Keep test traffic and data synthetic or appropriately anonymized. Profile artifacts can contain secrets and user data; restrict and delete them after review.
