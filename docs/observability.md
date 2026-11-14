# Relay Observability Architecture

**Audience:** platform engineering, service owners, SRE, incident commanders, security engineering, and technical evaluators.
**Status:** implementation map and operational design guide. Metrics and dashboards described here are configuration-backed capabilities, not evidence of a production monitoring deployment.

## 1. Observability objectives

Relay spans browser and native clients, HTTP and GraphQL APIs, WebSockets, PostgreSQL, MongoDB, Redis, RabbitMQ, object storage, Python AI workflows, and asynchronous workers. Observability must make a user-visible operation traceable across those boundaries without leaking credentials or high-cardinality identifiers into metric labels.

The operating model separates four questions:

1. **Is it alive?** A process can answer a local liveness probe.
2. **Can it serve?** Required dependencies and initialization are healthy enough for traffic.
3. **Is the user journey working?** Authentication, API requests, realtime delivery, uploads, retrieval, and asynchronous completion succeed.
4. **Is the service within its operating envelope?** Latency, queue age, errors, saturation, storage capacity, and cost remain controlled.

A green container health check is necessary but not sufficient evidence of end-to-end health.

## 2. Instrumentation inventory

| Component | Evidence in repository | Operational signal |
|---|---|---|
| Go API Gateway | `/healthz`, `/readyz`, Prometheus metrics on its metrics listener | process health, upstream readiness, HTTP traffic, status distribution, latency |
| Express API | `/api/health/ready`, `/metrics` | API health, request/error metrics, process-specific signals |
| NestJS API | `/health`, `/health/ready`, `/metrics` | domain API readiness and metrics |
| Go Jobs API | `/healthz`, `/readyz`, `/rabbitmqz`, `/worker-health`, metrics listener | publisher dependency, Redis status snapshot, worker heartbeat |
| Go Jobs Worker | Redis/RabbitMQ health and worker heartbeat/status integration | consumer activity, retry and recovery behavior |
| Python AI service | `/healthz`, `/readyz`, protected internal metrics | API process readiness and configured dependency state |
| Prometheus | `monitoring/prometheus/prometheus.yml` | scrape collection and local time-series retention |
| Blackbox Exporter | `monitoring/blackbox/config.yml` | HTTP probe checks |
| cAdvisor | Compose service | container resource telemetry |
| Grafana | Compose service and provisioned datasource configuration | dashboard presentation layer |

The repository configures Prometheus with a 15-second scrape interval and 15-day local retention. This is a development configuration baseline; production retention, HA, remote write, and access controls must be designed for the selected environment.

## 3. Health semantics

Use health endpoints according to their intent:

- **Liveness:** process can respond; do not fail liveness merely because a recoverable downstream dependency is unavailable.
- **Readiness:** instance can accept the traffic expected by its contract. Include mandatory dependencies and schema/config initialization.
- **Dependency probe:** check a particular broker, database, or worker heartbeat. Do not confuse an optional subsystem with readiness for unrelated user journeys.
- **Synthetic journey:** exercise a safe, representative path through the public edge and relevant backend services. Synthetic accounts and test data must be isolated.

The gateway readiness handler checks the Express and Nest health endpoints. Compose health checks additionally cover selected dependencies and workers. Python, Jobs API, and worker diagnostic endpoints are separately available through the local NGINX diagnostic mappings where configured.

## 4. Metrics design

### RED for request-serving services

Measure:

- **Rate:** requests per second by service and stable route template.
- **Errors:** failed requests by bounded status/error category.
- **Duration:** latency distributions (p50, p90, p95, p99) with consistent units.

### USE for infrastructure and workers

Measure:

- **Utilization:** CPU, memory, file descriptors, connection pools, queue consumers, storage throughput.
- **Saturation:** pending work, event-loop delay, queue depth/age, connection acquisition wait, disk pressure.
- **Errors:** failed publish/consume, retries, dead letters, dependency reconnects, upload/processing failures.

### Domain-specific indicators

| Domain | Suggested indicators | Alerting interpretation |
|---|---|---|
| Authentication | login/session validation successes and failures; auth dependency latency | distinguish invalid credentials from service failure |
| Messaging | send acceptance, persistence failures, Socket.IO delivery acknowledgements where available | compare HTTP success with downstream delivery |
| Calls | setup/accept/end outcomes, authorization decisions, signaling failures | segment by call lifecycle stage |
| Recording | authorized recording count, upload completion, track completion, processing outcomes | distinguish consent, client capture, upload, storage, and worker failures |
| Knowledge/RAG | ingest success, embedding latency/errors, retrieval empty-rate, answer latency, citation validation/abstention | monitor answer quality and security scope, not latency alone |
| Jobs | accepted, completed, retries, DLQ count, queue age, worker heartbeat | sustained queue age is often more actionable than queue depth alone |
| Database | pool utilization, query latency, connection failures, replication/backup state where deployed | avoid exposing SQL or customer identifiers in labels |

The repository does not define organization-approved SLO targets or prove achieved production values. Establish them with service owners and measured workload data; see [SLO and error-budget framework](reliability/slo-and-error-budgets.md).

## 5. Correlation and cardinality

Use request IDs and stable job/call/document correlation identifiers in logs and traces. The gateway supports request correlation and forwards request metadata. Preserve correlation across service-to-service calls where a trusted boundary exists.

Do not put unbounded values such as user IDs, email addresses, document IDs, prompts, full URLs with query strings, call IDs, or exception text into Prometheus labels. Keep those values in access-controlled logs when justified. Never log authorization headers, cookies, API keys, refresh tokens, signed object URLs, transcript contents, or raw model prompts by default.

## 6. Dashboard design

A useful service dashboard should include:

1. availability/readiness and deployment version;
2. traffic, errors, and latency distributions;
3. dependency health and pool usage;
4. worker and queue indicators for asynchronous services;
5. resource utilization and saturation;
6. release annotations and links to the relevant runbook.

A user-journey dashboard should correlate the edge request with downstream Express/Nest/Python activity, broker jobs, and recording or AI processing outcomes. Keep the top-level dashboard low-noise; use per-service drill-downs for diagnostic detail.

## 7. Alert quality and incident integration

Alerts should be actionable, owned, and tied to a user or operator impact. Each alert definition should state:

- symptom and affected service/journey;
- measured expression and evaluation window;
- severity and paging policy;
- owner and escalation path;
- first-response runbook;
- known false-positive or maintenance conditions.

Prefer multi-window, multi-burn-rate alerts for mature SLOs. For a new service without validated SLOs, begin with dependency outages, sustained high error rates, queue-age growth, worker heartbeat loss, storage exhaustion, and backup failures, then calibrate thresholds from observations.

## 8. Operational caveats and maturity gaps

- Compose includes Prometheus, Grafana, cAdvisor, and Blackbox Exporter; a Compose deployment is not equivalent to a hardened production monitoring plane.
- The repository demonstrates metrics and probes, but does not by itself prove an installed alert manager, centralized immutable log platform, distributed tracing backend, on-call schedule, or 24×7 response capability.
- Local Prometheus storage is not a backup or disaster-recovery strategy.
- Dashboard presence is not evidence that an alert is routed or acknowledged.
- Production monitoring must be isolated from public application ingress and protected with SSO/RBAC, network controls, secret handling, and audit retention.

## 9. Operator checklist

- [ ] Verify all service targets are discovered and scraped.
- [ ] Confirm probe failures distinguish DNS, TLS, routing, authentication, and upstream errors.
- [ ] Check scrape gaps and target cardinality.
- [ ] Confirm dashboards show the deployed artifact version.
- [ ] Test alert delivery to the intended on-call route.
- [ ] Verify alert links open the current runbook.
- [ ] Confirm log access, redaction, retention, and access audit.
- [ ] Confirm telemetry storage has capacity and backup/restore procedures.
- [ ] Run a synthetic user journey and verify cross-service correlation.

## Related documents

- [Reliability objectives](reliability/slo-and-error-budgets.md)
- [Incident response](operations/incident-response.md)
- [Performance engineering](performance/resource-efficiency.md)
- [Security and operations](security-and-operations.md)
