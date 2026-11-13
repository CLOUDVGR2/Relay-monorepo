# Relay Observability Architecture

## Signals

Relay's observability model combines:
- structured application logs;
- request correlation identifiers;
- Prometheus metrics;
- service liveness and readiness endpoints;
- worker heartbeat and queue state;
- Blackbox Exporter probes;
- Grafana datasource provisioning;
- cAdvisor container resource metrics in the Compose topology.

## Correlation

The API gateway validates or generates an `X-Request-ID`, propagates it to downstream HTTP requests, and returns it to the client. Downstream services should preserve correlation metadata in logs. Long-running jobs require durable job/task/call identifiers in addition to request IDs.

## Health semantics

| Signal | Meaning | Typical consumer |
|---|---|---|
| Liveness | Process can respond and continue | Kubernetes restart policy |
| Readiness | Instance can accept assigned work | Service endpoint routing |
| Dependency readiness | Required dependency checks for one service | Deployment and operational dashboard |
| Worker heartbeat | Worker recently reported progress/liveness | Jobs API and operations view |
| Queue age/depth | Backlog and processing pressure | Queue operations |
| Synthetic journey | End-to-end user-visible behavior | SLO and release validation |

## Metrics design

Use low-cardinality labels such as route templates, method, status class, service, and bounded outcome categories. Do not label metrics with user IDs, request IDs, document IDs, conversation IDs, or arbitrary URL values.

## Operational dashboards

Organize dashboards by service boundary and user journey:
- ingress and API latency/error rates;
- database and broker health;
- worker heartbeat, queue depth, age, retries, and dead letters;
- AI provider latency, request outcomes, retrieval duration, and token usage;
- recording upload and processing lifecycle;
- resource utilization and saturation.

## Alert design

Alerts should identify user impact, actionable symptoms, owner, and runbook. Prefer multi-signal alerts over process-only checks. Suppress noisy alerts during known maintenance while preserving security and data-integrity alerts.

## Privacy

Logs and metrics must exclude credentials, authorization headers, cookies, full user transcripts, source document content, and raw recording data. Capture only the metadata required to correlate and diagnose execution.
