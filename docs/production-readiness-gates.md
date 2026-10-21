# Production readiness gates

This checklist is intentionally evidence-driven. “Implemented” means code/config exists; “verified” means the relevant automated or operational test has passed; “approved” means the accountable owner has accepted residual risk.

## Gate 0 — ownership and contracts

- [ ] Every service has an owner, support route, dependency map and data classification.
- [ ] API/event contracts document authn/authz, limits, timeouts, idempotency and compatibility.
- [ ] Schema migrations use an expand/migrate/contract plan for rolling deployments.
- [ ] The canonical deployment source and artifact provenance are unambiguous.

## Gate 1 — security

- [ ] Secret scanning and dependency/image vulnerability scans run on PR and release.
- [ ] No unresolved critical vulnerability; high findings have explicit time-bound exceptions.
- [ ] Object-level authorization and tenant isolation tests cover every sensitive operation.
- [ ] Rate/body/query/upload/concurrency limits are enforced at service boundaries.
- [ ] Production TLS, managed secrets, least-privilege IAM/RBAC, network policies and audit logging are verified.
- [ ] AI retrieval/tool authorization and prompt-injection cases have adversarial tests.

## Gate 2 — correctness and change safety

- [ ] Unit, integration, contract and E2E suites pass in clean CI environments.
- [ ] Race/concurrency tests cover worker state, idempotency and cancellation paths.
- [ ] Migrations are tested against representative prior-version data.
- [ ] Rollback artifact is available and rollback/schema compatibility has been exercised.

## Gate 3 — reliability and operability

- [ ] Approved SLO/SLI and error-budget queries exist; alert routes are tested.
- [ ] Liveness/readiness/startup semantics are validated during dependency failure.
- [ ] Graceful shutdown completes within orchestrator grace period and recovers in-flight jobs safely.
- [ ] Database, broker and object/document restore drills meet approved RPO/RTO.
- [ ] Incident, credential-rotation, rollback and restore runbooks have been rehearsed.

## Gate 4 — performance and capacity

- [ ] Baseline, peak, burst, soak, degradation and recovery tests have reproducible reports.
- [ ] CPU/memory limits and requests have a documented workload-based rationale.
- [ ] p95/p99, saturation, pool wait, queue age and memory growth meet approved budgets.
- [ ] Autoscaling and downstream capacity were tested together; scaling cannot overload shared state.
- [ ] Overload produces bounded latency and controlled 429/503 behavior, not unbounded queues.

## Gate 5 — release approval

- [ ] Immutable artifact digest, SBOM/provenance and scan reports are attached to release.
- [ ] Deployment diff, feature flags, schema impact, rollback trigger and observation window are reviewed.
- [ ] Open risks have an owner, due date, severity and explicit approval.
- [ ] Production sign-off is recorded by service owner, security and operations as required.

A checked box without a linked artifact, test run, dashboard, drill report or named approval is not evidence. This repository does not claim that all gates are already satisfied merely because these gates are documented.
