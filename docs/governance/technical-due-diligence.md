# Relay Technical Due-Diligence Guide

This checklist is intended for enterprise engineering, security, procurement, architecture and talent-evaluation reviews. It provides evidence requests rather than assumptions.

## 1. Architecture and ownership

- [ ] Service owners and escalation contacts are assigned for every API and worker.
- [ ] Public route allowlist and internal service routes are documented and tested.
- [ ] API contracts are versioned or have a compatibility policy.
- [ ] Every asynchronous producer has a known consumer and failure/replay policy.
- [ ] Cross-service dependencies, timeout budgets and failure propagation are mapped.
- [ ] Runtime topology is backed by a current environment diagram and deployment inventory.

## 2. Identity and access control

- [ ] Express and Nest authenticate the same Relay identity consistently.
- [ ] JWT signing key lifecycle, token expiry, rotation and revocation are documented.
- [ ] Session invalidation and deleted-account behavior are tested.
- [ ] Internal service tokens are separate from user identity and rotated per environment.
- [ ] Service accounts follow least privilege.
- [ ] HTTP, GraphQL, Socket.IO and internal worker authorization are independently tested.
- [ ] User-owned document/list/detail behavior and shared document search are understood.
- [ ] Document classification and per-document ACL requirements have been assessed.

## 3. AI and data governance

- [ ] The shared Knowledge Base corpus is approved for its current cross-user visibility.
- [ ] Organization, group and document ACL design exists where the data requires isolation.
- [ ] Embedding model, dimension and version are recorded per corpus/re-embedding operation.
- [ ] Retrieval evaluation queries, relevant passages and ranking metrics are versioned.
- [ ] Grounded-answer tests check factual entailment, not only citation-ID validity.
- [ ] Prompt-injection, document poisoning and cross-document leakage tests exist.
- [ ] Generation/embedding provider terms, data retention and processing region are approved.
- [ ] Generated summaries/action items are human-verified before being treated as commitments.

## 4. Reliability and scale

- [ ] Numerical SLOs are approved from measured traffic and business criticality.
- [ ] Latency/error/queue-age metrics are available and alert thresholds are owned.
- [ ] Database pools, broker consumers, worker concurrency and AI provider concurrency are bounded.
- [ ] RabbitMQ redelivery, retry and DLQ paths are tested with live dependencies.
- [ ] Worker heartbeats detect missing, stale and malformed state.
- [ ] Graceful shutdown and rolling restart behavior are verified.
- [ ] Capacity testing covers API, GraphQL, realtime, RAG, recording and worker workloads.

## 5. Recovery and data protection

- [ ] PostgreSQL, MongoDB and object-store backups are scheduled and access-controlled.
- [ ] Restore tests validate integrity and measured recovery time.
- [ ] Queue replay and worker retry are safe and idempotent.
- [ ] Recording objects and relational metadata are reconciled after recovery.
- [ ] Data retention and deletion propagation are specified per data class.
- [ ] Legal hold and audit-retention requirements are defined where applicable.

## 6. Software supply chain and delivery

- [ ] CI covers every changed service and consumer.
- [ ] Dependency lockfiles are checked with frozen installs.
- [ ] Container images are built from reviewed source commits and promoted by immutable digest.
- [ ] Image signing/provenance/SBOM requirements are defined and verified.
- [ ] Secret, dependency, container and IaC scans have owners and exception policies.
- [ ] Schema and event changes use expand/migrate/contract where needed.
- [ ] Rollback and forward-fix procedures are exercised.

## 7. Security and compliance evidence

Request actual policy, assessment and test artifacts. The presence of security middleware, a threat-model document or External Secrets manifests is not a certification. Require scoped evidence for encryption, key management, access logging, penetration testing, vulnerability remediation, incident response, vendor risk, data processing, retention and regulatory obligations.

## 8. Talent and engineering capability review

For candidate evaluation, ask the author to:

- trace an authenticated user request through the route allowlist;
- explain a database relationship and migration;
- walk through a queue retry and idempotency decision;
- explain RAG evidence retrieval and citation validation;
- identify the current shared Knowledge Base access-control limitation;
- demonstrate a failure-handling test and discuss what it does not prove;
- propose one prioritized architecture improvement with measurable acceptance criteria.

## 9. Evidence register template

| Claim | Artifact / source | Environment | Commit / version | Verification method | Result | Owner / date |
|---|---|---|---|---|---|---|
| Example: API readiness | Readiness endpoint + dashboard | Staging | Release SHA | Synthetic probe | Pending | Owner/date |
| Example: restore test | Backup job + restore report | Recovery environment | Backup identifier | Timed full restore | Pending | Owner/date |

Keep the register current. Replace `Pending` only with retained, reviewable evidence.
