# Production Readiness and Release Operations

## 1. Purpose

This guide defines release gates and operational expectations for Relay. It is not a deployment record and does not imply that a production environment currently exists. Every release decision must be based on evidence for the exact commit, images, configuration, and target environment.

## 2. Release decision framework

A release may proceed only when all required gates have an accountable owner, an observable pass/fail result, and documented exceptions. “Code exists” is not a release gate.

### Gate A — Change integrity
- Identify the exact source commit and review all changed files.
- Confirm the intended service boundary and API/event/schema impact.
- Verify that no secrets, customer data, generated credentials, local databases, or machine-specific artifacts were introduced.
- Review dependency lockfile changes and image base-image changes.
- Confirm backward compatibility for clients and concurrently deployed services.

### Gate B — Build and automated verification
- Install from lockfiles using supported toolchains.
- Run formatting, linting, type checks, unit tests and service integration tests.
- Run `docker compose config --quiet` with controlled local configuration.
- Build all release images from the intended Dockerfiles.
- Render every target Kustomize overlay and validate schema, security policy and resource configuration.
- Capture command, tool version, commit SHA, exit code and report artifacts.

### Gate C — Security
- Scan dependencies, container images and generated SBOMs.
- Run secret scanning and static analysis.
- Verify authentication, authorization, tenant isolation and object-level access controls.
- Review CORS, CSRF where applicable, proxy trust, rate limiting, request size limits, TLS termination, cookie flags and security headers.
- Confirm least-privilege database and queue credentials.
- Verify that logs and traces redact tokens, passwords, connection strings and sensitive user content.
- Review file upload, SSRF, injection, deserialization, model/tool invocation and resource-exhaustion risks.
- Record threat-model changes and residual risk acceptance.

### Gate D — Integration
Test actual deployed components together, not only mocks:
- web client through the intended ingress/gateway;
- gateway route, timeout, error and header behavior for every published path;
- Express HTTP and Socket.IO authentication, reconnect and event authorization;
- NestJS GraphQL and HTTP operations, validation, pagination and authorization;
- job publication, worker consumption, status transitions and duplicate delivery;
- Redis, MongoDB and PostgreSQL failure behavior;
- AI document ingestion, indexing, retrieval, provider failure and authorization filtering;
- migrations against a representative pre-release dataset.

### Gate E — Operational readiness
- Service dashboards and alert rules exist and have been exercised.
- Logs contain correlation IDs and safe error classifications.
- Liveness, readiness and dependency-health semantics are documented.
- Capacity limits, timeouts, concurrency, queue thresholds and autoscaling behavior are measured.
- Runbooks cover dependency outage, queue backlog, stuck jobs, failed migration, bad image, credential rotation and rollback.
- Backup restoration has been tested in isolation.
- RTO/RPO are defined and evidence supports them.
- A named owner accepts the release and remaining risk.

## 3. Configuration and secret handling

### Local Compose prerequisites

The root `compose.yaml` currently uses pre-existing external volumes with `fullstack-chat-app_*` names and project-specific local infrastructure image tags (`relay-mongodb:local`, `relay-rabbitmq:local`, `relay-redis:local`, and `relay-postgres:local`) without build definitions. A clean machine cannot be assumed to have these resources. Verify them before startup. Do not remove external-volume declarations, recreate volumes, or substitute images without a reviewed data-compatibility and migration plan.

### Configuration contract
Maintain an inventory for every environment variable:
- owning service;
- required/optional status;
- default behavior;
- secret classification;
- validation rules;
- rotation procedure;
- deployment source;
- safe logging behavior.

Required configuration should fail startup with a safe, actionable message. Avoid silent fallback for credentials, signing keys, authorization policy or durable storage settings.

### Secrets
- Use distinct credentials for development, test, staging and production.
- Store production secrets in an approved secret manager or platform-native encrypted mechanism.
- Rotate credentials after suspected exposure and record dependent services that require restart.
- Never copy production secrets into `.env.example`, tickets, logs, shell history or CI output.
- Treat Kubernetes Secret base64 data as encoded, not encrypted.
- Avoid printing environment dumps from production processes.
- Ensure browser bundles contain no server-side credentials.

### Environment separation
Local Compose, CI, staging and production must have separate credentials, data stores, external provider keys and access controls. A loopback host port is a local exposure control, not an authentication mechanism.

## 4. Service-specific release concerns

### Web client
- Verify production build output, asset caching, content security policy, error handling and source-map policy.
- Validate Nginx proxy targets against Compose or cluster DNS names.
- Test session expiration and unauthorized responses.
- Confirm browser-public variables contain no secrets.
- Exercise accessibility, responsive behavior and critical user journeys.

### Express API
- Verify session/JWT lifecycle, password and token handling, rate limits and authorization at every protected route.
- Exercise Socket.IO handshake auth, room authorization and reconnect behavior.
- Confirm MongoDB indexes and migrations/compatibility procedures.
- Verify Redis outage behavior and rate-limit semantics when horizontally scaled.
- Test AI-service timeout, malformed response, unavailable service and internal-token rotation.

### NestJS API
- Verify GraphQL schema compatibility, resolver authorization, query bounds, pagination and error sanitization.
- Apply Prisma migrations through a controlled release process.
- Confirm generated client artifacts match the schema.
- Test relational integrity, transaction boundaries and connection-pool exhaustion.

### Go jobs API and worker
- Verify publisher confirms and failure semantics where required.
- Define queue durability, message persistence, retry, dead-letter and retention policy.
- Test duplicate delivery and idempotent side effects.
- Test crashes before/after side effects and before/after acknowledgements.
- Validate graceful shutdown with in-flight work and broker reconnect.
- Alert on oldest message age, queue depth, redelivery rate, failed jobs and worker saturation.

### Python AI service
- Validate retrieval authorization before context reaches a model.
- Bound input size, chunk count, embedding throughput, model concurrency, token usage and provider timeout.
- Test provider rate limits, provider outage, malformed outputs and cancellation.
- Version embedding models, chunking rules, prompts, indexes and ingestion pipelines.
- Test migration rollback/forward-fix strategy and vector-index rebuild/recovery.
- Define policy for prompt injection, untrusted retrieved text and model tool access.

### API gateway
- Enumerate every public route and expected upstream.
- Test path rewriting, query strings, methods, streaming, WebSocket upgrade where supported, request IDs and safe response headers.
- Set bounded connect/read/write/overall deadlines.
- Verify 502/503/504 classification and response-body stability.
- Confirm readiness semantics reflect required dependencies without turning every optional dependency into a hard outage.
- Do not assume an upstream URL is externally reachable until a route test proves it.

## 5. Data migration and compatibility

Use an expand/migrate/contract sequence for schema changes:
1. **Expand:** introduce nullable or additive schema elements compatible with old and new versions.
2. **Deploy compatible code:** support both representations if needed.
3. **Backfill:** run bounded, observable, resumable migration jobs.
4. **Switch reads/writes:** verify consistency and error rates.
5. **Contract:** remove obsolete schema only after old versions and rollback paths are retired.

For each migration, record lock behavior, duration estimate, batch size, transaction boundaries, rollback/forward-fix approach, backup requirements, and validation query. Never assume a destructive migration can be rolled back by redeploying an older container.

## 6. Deployment strategy

Choose a rollout strategy appropriate to state compatibility and available infrastructure:
- rolling update for compatible stateless changes;
- canary for changes whose impact can be measured and traffic isolated;
- blue/green when duplicate capacity and safe data compatibility are available;
- maintenance window for unavoidable incompatible schema or state transitions.

The chosen strategy must define:
- health gate and soak time;
- metrics and thresholds that stop rollout;
- traffic shift/rollback authority;
- migration ordering;
- old/new version compatibility;
- maximum tolerated error budget burn;
- operator communication and incident ownership.

Kubernetes readiness probes should prevent routing to unready pods. Liveness probes should detect unrecoverable process states, not restart services merely because a downstream dependency is temporarily unavailable. Resource requests/limits and autoscaling targets must be justified by load evidence.

## 7. Rollback and forward recovery

A rollback is safe only if the prior application version remains compatible with the current database schema, queued messages, cached values and external side effects.

Before deployment:
- identify the previous image digest and manifest revision;
- confirm database migration compatibility;
- determine whether queue messages are readable by both worker versions;
- document irreversible external side effects;
- rehearse the rollback command or GitOps revert;
- define when a forward fix is safer than rollback.

After rollback, verify user-facing requests, authentication, background queue processing, error rate, latency, database connectivity, and backlog drain. Preserve evidence before deleting failed pods or logs.

## 8. Observability and incident response

### Minimum service signals
- request rate, error rate, and latency percentiles;
- dependency request latency and error rate;
- CPU, memory, restarts, file descriptors and connection pools;
- queue depth, oldest-message age, redelivery, retry and terminal failure counts;
- AI provider latency, token usage/cost, retrieval latency and empty/low-confidence retrieval rate;
- database saturation, slow queries, lock contention, replication/backup health where applicable.

### Incident lifecycle
1. Detect and establish incident commander/owner.
2. State impact, start time, affected services and known unknowns.
3. Mitigate customer impact before pursuing root cause.
4. Preserve logs, traces, metrics, deployment events and relevant queue/database state.
5. Communicate status through the defined channel.
6. Verify recovery using customer-visible and service-level signals.
7. Complete a blameless review with actionable owners and due dates.

Health endpoints must not disclose sensitive infrastructure details. Logs must not be treated as the only source of truth for durable business state.

## 9. Backup, restore and disaster recovery

For each data system, define:
- data classification and retention;
- backup frequency and consistency model;
- encryption and access control;
- off-site or cross-account isolation where required;
- retention and deletion policy;
- restore owner and runbook;
- measurable RPO/RTO;
- validation queries and application-level integrity checks.

A backup is not validated until it has been restored into an isolated environment and checked. A database snapshot alone may not recover queue state, object storage, vector indexes, signing keys, schema versions or external side effects. Document the order in which dependencies and services must be restored.

## 10. Capacity and cost controls

Set explicit limits for:
- HTTP concurrency and request body size;
- database pool sizes and query duration;
- queue depth, message size and consumer concurrency;
- worker CPU/memory and job duration;
- file upload and document ingestion size;
- embedding/model provider concurrency and tokens;
- per-user/tenant request rate and cost.

Load tests must use a representative workload and report throughput, p50/p95/p99 latency, error rate, saturation, queue age, and cost assumptions. Autoscaling configuration without a measured signal and safe scale-down behavior is not capacity evidence.

## 11. Release sign-off template

A release record should contain:
- release version and commit SHA;
- image digests and manifest revision;
- migration and compatibility assessment;
- CI and integration test reports;
- security scan findings and accepted exceptions;
- deployment smoke-test results;
- dashboards and alert checks;
- backup/restore evidence;
- rollback procedure and decision owner;
- residual risks, owner, mitigation and due date;
- explicit acceptance by engineering and operational owners.

## 12. Current repository status

The repository is marked active development. The reorganization itself did not execute service test suites, build all images, apply Kubernetes manifests, deploy AWS resources, or conduct a security or recovery exercise. Use [Implementation Status](implementation-status.md) as the verification ledger; do not convert this guide into a production-readiness claim without evidence.


## Evidence-driven readiness and operations

Use the [production readiness gates](production-readiness-gates.md) as the release decision checklist. The [threat model](security/threat-model.md), [SLO/error-budget policy](reliability/slo-and-error-budgets.md), [CPU/memory engineering guide](performance/resource-efficiency.md), [incident runbook](operations/incident-response.md), and [backup/restore runbook](operations/backup-and-disaster-recovery.md) provide the deeper operational contracts. These are proposed controls and targets until the named owners validate them in the actual target environment.
