# Reliability objectives and error budgets

This document defines a proposed measurement contract. Targets are initial engineering goals, not measured claims. Service owners must approve targets against product requirements and measured baseline before using them as contractual SLOs.

## 1. User-visible indicators

| Indicator | Definition | Initial target for production candidate |
|---|---|---|
| API availability | eligible requests returning a valid non-5xx response / eligible requests | 99.9% over rolling 30 days |
| API latency | successful and failed eligible request latency, segmented by route class | p95 < 300 ms for non-AI synchronous APIs; p99 < 1 s, excluding explicitly long-running work |
| AI request latency | end-to-end request latency by provider/model and token class | establish baseline; set separate interactive and async objectives |
| Job completion | accepted jobs reaching a terminal state within the published deadline | ≥ 99% within 5 minutes for supported short jobs, subject to workload validation |
| Queue freshness | age of oldest ready message | alert on sustained growth; initial warning at 60 s, critical at 5 min |
| Data recovery | demonstrated restore point and restore duration | RPO/RTO must be approved per data class before production |

Exclude only documented, genuinely ineligible traffic (for example, malformed requests before admission). Do not remove 5xx responses, timeouts, dependency failures, or overload rejections merely to improve an SLI. Publish both availability and admission/overload rates.

## 2. Error-budget policy

For a 99.9% monthly availability target, the nominal budget is 0.1% of eligible requests (approximately 43.8 minutes only if measured as time-based availability; request-based SLOs must be computed from request counts instead). Use a rolling window and an agreed query as the source of truth.

- **Healthy budget:** normal delivery; preserve required gates.
- **Budget burn:** prioritize reliability defects and reduce risky changes.
- **Fast burn / customer impact:** stop rollout, mitigate, communicate, and use the incident process.
- **Budget exhausted:** pause nonessential launches until the owner-approved recovery plan is met.

Do not use uptime of a process as a proxy for end-to-end availability. Readiness, dependency health, user journey success, queue completion and data integrity are distinct signals.

## 3. Health semantics

- **Liveness:** process can make progress. Do not fail liveness solely because a remote dependency is down; doing so can create restart storms.
- **Readiness:** instance can safely accept the traffic/work assigned to it. Include only dependencies whose absence makes the instance unable to serve correctly.
- **Startup:** allow migrations, model initialization and connection-pool warmup a bounded startup window before liveness applies.
- **Synthetic checks:** exercise a low-cost, authenticated or carefully scoped representative journey without mutating user data.

Health endpoints must not disclose dependency credentials, raw exception messages, topology details or arbitrary environment values.

## 4. Resilience patterns

1. Set a total request deadline and derive smaller dependency deadlines from remaining time.
2. Retry only transient errors, only within the caller's remaining deadline, with capped exponential backoff and jitter. Never retry a non-idempotent mutation without an idempotency key or durable deduplication.
3. Use bounded connection pools, per-dependency concurrency limits and queue prefetch. A timeout without a concurrency limit can still exhaust resources.
4. Use bulkheads to isolate slow providers and optional features from core chat/API paths.
5. Circuit breakers are justified only with observable state, carefully selected failure signals, bounded half-open probes and tests for recovery. Do not wrap every call by default.
6. Reject excess work explicitly (429/503 with retry guidance where appropriate) instead of queuing unbounded requests in memory.
7. For queue workers, distinguish retryable errors from permanent validation/business failures; cap attempts and route poison messages to a monitored dead-letter path.
8. During shutdown, stop admitting new work, cancel consumers, drain within the termination grace period, and leave uncompleted messages recoverable.

## 5. Deployment and availability

- Replicas are not high availability if all replicas share one failure domain, one non-replicated database, one zone or one credential dependency.
- Use at least two failure domains for critical stateless services when the platform supports it; use topology spread/anti-affinity and disruption budgets after capacity is verified.
- Autoscaling requires working resource requests, metrics-server or equivalent, scale-up headroom, scale-down stabilization, and a test that the downstream database/broker can tolerate the new concurrency.
- Stateful components need supported replication, backup, restore, quorum and upgrade procedures. A Kubernetes Deployment with one database pod is not a production HA database.
- Rollouts must have readiness probes, bounded surge/unavailability, a rollback artifact, and schema compatibility across old/new versions.

## 6. Required resilience exercises

Before a production claim, run and retain evidence for: database connection loss, broker restart, Redis loss, AI provider timeout/rate-limit, malformed provider output, worker crash after side effect but before acknowledgement, duplicate delivery, SIGTERM under load, slow client, saturated connection pool, and rollback with an in-flight schema migration.
