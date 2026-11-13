# Release Acceptance and Production Verification

This document defines the evidence required to accept a Relay release into a production environment.

## Gate 1 — Artifact integrity

- Source commit and dependency lockfiles are recorded.
- Container images are traceable to the source commit.
- Published artifacts are scanned and referenced by immutable digest.
- Build provenance and deployment manifests are retained.

## Gate 2 — Contract and data compatibility

- HTTP, GraphQL, Socket.IO, and AMQP changes are reviewed with their consumers.
- Database migrations are ordered and tested against representative data.
- Tenant and ownership constraints are covered by positive and negative tests.
- Rollback compatibility is documented.

## Gate 3 — Security

- Authentication and authorization tests pass for protected routes.
- Secrets are injected through the approved secret mechanism.
- Network policies, IAM permissions, and service accounts follow least privilege.
- Container and Kubernetes security checks are reviewed.
- Sensitive values are excluded from logs, artifacts, and client bundles.

## Gate 4 — Reliability

- Liveness and readiness probes reflect the service's actual ability to serve.
- Timeouts, retries, concurrency, queue prefetch, and shutdown are bounded.
- Duplicate delivery and retry behavior are tested.
- Worker heartbeats and dead-letter handling are observable.
- Backup and restore procedures have been exercised.

## Gate 5 — Performance and capacity

- Representative workload profiles are defined.
- API latency, error rate, queue age, worker throughput, and resource consumption are measured.
- Database pool sizing and broker capacity are validated under expected concurrency.
- AI provider limits, token budgets, and execution timeouts are configured.

## Gate 6 — Operational ownership

- Service owners and escalation contacts are identified.
- Dashboards and alert routing are configured.
- Deployment, rollback, recovery, and incident procedures are accessible.
- Release notes and operator handoff are complete.

Approval is based on recorded evidence for the target environment and release artifact. A manifest render or unit test is not a substitute for an end-to-end deployment check.
