# Production Readiness Gates

**Purpose:** define objective acceptance evidence for a Relay production launch or material expansion. This checklist is intentionally stricter than “containers start” or “CI passes.” A gate is complete only when evidence is reviewed and retained by its named owner.

## Gate 0 — Product and service ownership

- [ ] Product owner, technical owner, and on-call owner assigned for each user journey.
- [ ] Service catalogue, dependency graph, data classification, and external integrations reviewed.
- [ ] User-facing capabilities and known limitations accurately represented.
- [ ] Support process, escalation, and customer communication paths established.

## Gate 1 — Security and privacy

- [ ] Threat model reviewed for browser/mobile, API, WebSocket, GraphQL, AI, workers, storage, and CI/CD.
- [ ] Authentication, authorization, object ownership, tenant boundaries, and internal service identity tested.
- [ ] Shared Knowledge Base behavior explicitly approved: authenticated users can search across tenant-owned documents; this is a data-sharing policy, not merely a retrieval optimization.
- [ ] Document uploader attribution is not treated as an access-control boundary.
- [ ] Secrets managed and rotated; no secrets in repository, image, logs, or build artifacts.
- [ ] TLS, ingress, egress, firewall, workload identity, and admin access reviewed.
- [ ] Dependency, source, secret, and image scans reviewed with remediation SLAs.
- [ ] Retention, deletion, consent, privacy notice, legal hold, and subject-request behavior reviewed.
- [ ] Security incident reporting and evidence-preservation process tested.

## Gate 2 — Data durability and recovery

- [ ] PostgreSQL, MongoDB, object storage, and required broker state have approved backup policies.
- [ ] Restore tests completed in an isolated environment with measured RPO/RTO.
- [ ] Encryption at rest/in transit and key ownership verified.
- [ ] Migration order, compatibility, rollback/forward-repair, and data validation rehearsed.
- [ ] Recording object retention, lifecycle, deletion, and authorization tested.
- [ ] Queue replay and idempotency behavior tested under worker restart.

## Gate 3 — Reliability and observability

- [ ] Health/readiness semantics reviewed and dependency probes tested.
- [ ] SLOs approved, instrumented, and tied to user journeys.
- [ ] Alert delivery and escalation tested end to end.
- [ ] Logs are structured, correlated, access-controlled, and redacted.
- [ ] Metrics labels are bounded; high-cardinality identifiers stay out of labels.
- [ ] Dashboards and runbooks match deployed service versions.
- [ ] Capacity, queue-age, storage, model quota, and saturation alerts are configured.

## Gate 4 — Performance and capacity

- [ ] Representative workload and dataset agreed.
- [ ] Load/soak/spike and failure-injection tests run against production-like topology.
- [ ] API p95/p99, DB pools, queue latency, realtime concurrency, object throughput, and AI latency within approved limits.
- [ ] Autoscaling and failover capacity verified where deployed.
- [ ] Cost model includes compute, databases, broker, object storage, egress, telemetry, and model usage.

## Gate 5 — API and release compatibility

- [ ] Public route allowlist and downstream ownership reviewed.
- [ ] OpenAPI/GraphQL/Socket.IO/AMQP contracts versioned or compatibility-reviewed.
- [ ] Mobile and web client version skew tested.
- [ ] Rate limits, payload bounds, timeouts, cancellation, retries, and idempotency verified.
- [ ] Images and dependencies pinned; provenance and SBOM retained where available.
- [ ] CI branch triggers and required status checks match the protected default branch.

## Gate 6 — Operational execution

- [ ] Release/change window, operator, approvals, and rollback decision-maker recorded.
- [ ] Runbooks cover deploy, rollback, database restore, service degradation, broker failure, AI provider failure, call/recording failure, and security incident.
- [ ] Synthetic smoke tests use isolated non-production data and safe identities.
- [ ] Support and customer communication templates reviewed.
- [ ] Post-deploy monitoring window and success criteria agreed.

## Gate 7 — Formal go/no-go

The go/no-go record must contain:

| Item | Evidence |
|---|---|
| Release identity | commit SHA, image digests, manifest/config version |
| Gate status | pass/fail/exception per gate, owner, timestamp |
| Open risks | description, probability/impact, mitigation, accountable owner |
| Accepted exceptions | approver, expiry, compensating control, revisit date |
| Operational readiness | on-call route, alerts, dashboards, runbooks |
| Recovery readiness | tested restore date, measured RPO/RTO, recovery owner |
| Decision | go / conditional go / no-go and approving authority |

## Current evidence caveat

This repository provides implementation, tests, workflows, Compose services, observability configuration, and AWS/Kubernetes templates. It does not establish that production controls are deployed, independently audited, legally approved, or operating to a particular SLA. A launch decision requires environment-specific evidence.

## Related documents

- [Technical due diligence](governance/technical-due-diligence.md)
- [Security and operations](security-and-operations.md)
- [Reliability objectives](reliability/slo-and-error-budgets.md)
- [Production guide](production-guide.md)
