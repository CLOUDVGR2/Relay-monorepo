# Implementation Status and Verification Ledger

**Lifecycle:** Active development
**Production readiness:** Not established
**Evidence cutoff:** 2026-10-21. This ledger describes repository contents and static validation of the reorganization only. It does not claim that application suites or deployment tests were run on the reorganized tree.

## 1. Decision rule

Relay must not be described as production-ready solely because it has application code, tests, Dockerfiles, Compose services, health endpoints, or Kubernetes manifests. Readiness is a release decision supported by evidence from the exact commit and target environment.

Use these labels consistently:

- **Present in source** — relevant code or configuration exists.
- **Configured** — runtime or deployment configuration declares the behavior.
- **Locally verified** — a named command or scenario completed in a stated local environment.
- **Automated tests passed** — a named test command passed against a specific commit.
- **Integration verified** — the intended multi-service scenario passed with defined assertions.
- **Deployment verified** — the intended deployment was applied and exercised in its target environment.
- **Production accepted** — accountable owners explicitly accepted release criteria and residual risk.
- **Not verified** — available evidence is missing, stale, partial, or insufficient.
- **Not implemented / planned** — the capability is absent or remains future work.

A test file does not prove a test passed. A successful build does not prove runtime behavior. A healthy process does not prove dependency readiness. A green deployment does not prove recovery or security controls.

## 2. Repository inventory

| Component | Canonical path | Evidence visible in source | Status |
|---|---|---|---|
| React/Vite client | `apps/web/` | Application source, package scripts, Nginx configuration and browser-test setup | Present in source; full current suite not verified here |
| Expo/React Native client | `apps/mobile/` | Native login/signup, secure token storage, contact/presence list, text chat, Socket.IO auth, AI answers/citations, Expo configuration, and mobile security guide | Present in source; dependency installation, typecheck, native builds, and device integration not verified |
| Express/Socket.IO API | `services/express-api/` | Express application, authentication-related middleware, MongoDB/Redis integrations, tests and Dockerfile | Present in source; runtime integration not verified here |
| Legacy Express tree | `archive/express-api-legacy/` | Separate Express-oriented package and scripts from original archive | Preserved, not canonical Compose service |
| NestJS API | `services/nest-api/` | NestJS, GraphQL/Apollo, Prisma configuration, tests and Dockerfile | Present in source; current tests not run as part of this reorganization |
| Go jobs API | `services/jobs-api/` | Gin HTTP handlers, job status/worker health, middleware and tests | Present in source; current tests not run as part of this reorganization |
| Go jobs worker | `services/jobs-worker/` | RabbitMQ consumer, Redis integration, idempotency/reliability/shutdown code and tests | Present in source; delivery guarantees require scenario-level proof |
| Python AI service | `services/ai-service/` | FastAPI, SQLAlchemy/Alembic, pgvector and AI/RAG dependency declarations | Present in source; current test suite not run as part of this reorganization |
| Go API gateway | `services/api-gateway/` | Reverse-proxy configuration, health/readiness handlers, tests and Dockerfile | Present in source; current tests not run as part of this reorganization |
| Compose runtime | `compose.yaml` | Local infrastructure and application services, environment wiring, health checks, build contexts, external volume names, and project-specific local infrastructure image tags | Configured; YAML and build-context checks passed; Docker Compose validation not run. Several infrastructure images and external volumes must already exist locally. |
| Kubernetes | `infrastructure/kubernetes/` | Kustomize base, local overlay, AWS overlay, application and infrastructure manifests | Present in source; local/AWS render and deployment not verified; gateway deployment is not represented in the current overlays |
| CI | `Jenkinsfile`, `.github/workflows/` | CI configuration files | Present in source; pipeline execution not verified here |
| Security/operations docs | `docs/` | AI, deployment, operations and engineering references | Present; requires ongoing alignment with code and deployment reality |

## 3. Reorganization-specific caveats

The source archive had two Express-oriented directories, `backend/` and `express-api/`. The original root `compose.yaml` built `backend/`; therefore, the code from `backend/` was moved to `services/express-api/` as the canonical service. The other tree was preserved under `archive/express-api-legacy/`. No equivalence between these trees is assumed.

Service source paths and Compose service DNS names are distinct concepts. The Compose service identities were aligned with the canonical names where the configuration was safely identifiable. The established browser-facing gateway health route remains `/gateway/healthz`; the NGINX location and dashboard check must stay aligned. Kubernetes resource names are intentionally retained for compatibility, but they are not fully renamed to match the new source paths.

Static validation for the prior documentation/commenting revision: 75 relative Markdown links across 29 Markdown files resolve; 13 strict-JSON files parse (TypeScript JSONC files excluded); all 60 YAML files parse, including multi-document manifests; 65 `.js` files pass `node --check`; all 68 Python files pass `py_compile`; all 42 Go files are gofmt-clean; and the root npm script map was inspected. Concise file-level summaries were added to 238 source files that previously lacked a leading comment/docstring; existing comments were retained. These checks do not execute application behavior. Docker Compose, container builds, Kustomize rendering, service test suites, and cloud deployment workflows were not run. The available Go 1.23.2 toolchain is older than the Go versions declared by the modules (1.26.0 and 1.27.1), so Go tests were not run. Do not infer those outcomes.

## 4. Required verification ledger

Populate every row from actual command output. Record commit SHA, tool versions, OS/architecture, environment, command, exit status, and artifact/log reference.

| Gate | Suggested evidence | Status |
|---|---|---|
| Repository hygiene | `git diff --check` and clean-tree review | Trailing-whitespace scan passed; the ZIP has no Git index, so `git diff --check` and clean-tree review require comparison with the actual checkout |
| Compose schema | `docker compose config --quiet` with a controlled local `.env` | Not run: Docker Compose unavailable in this environment; YAML syntax and all 11 service build contexts/Dockerfiles were checked statically |
| Container build | `docker compose build` for all intended services | Not verified |
| Express | Root `npm run test:express-api` after dependency install and required test setup | Not verified |
| NestJS | Root `npm run test:nest-api` | Not verified |
| Frontend | Root `npm run test:web` and production build | Not verified |
| Python AI | Root `npm run test:ai-service` after creating the expected virtual environment | Not verified |
| Go jobs API | Root `npm run test:jobs-api` | Not verified |
| Go worker | Root `npm run test:jobs-worker` | Not verified |
| Gateway | Root `npm run test:api-gateway` | Not verified |
| Cross-service integration | Explicit tests for gateway → APIs, API → queue, worker → status store, AI → PostgreSQL | Not verified |
| Contract compatibility | Versioned HTTP, GraphQL, event, and schema compatibility checks | Not verified |
| Security | Dependency/SAST/secret scans, threat-model review, authz tests, image scan | Not verified |
| Kubernetes render | Kustomize render for each intended overlay and schema/policy checks | Not run: `kubectl`/`kustomize` unavailable; YAML syntax and local Kustomization resource paths were checked statically. Secret objects must be provisioned outside Git. |
| Deployment smoke | Target-environment smoke tests and rollback drill | Not verified |
| Backup/restore | Restore into an isolated environment and verify integrity and RPO/RTO | Not verified |
| Load/capacity | Workload model, saturation tests, latency/error SLO evidence | Not verified |
| Production acceptance | Named owners, runbooks, alert routes, risk sign-off | Not verified |

## 5. Minimum evidence attached to a release candidate

A release candidate should include:
- exact Git SHA and build provenance;
- test and static-analysis results from that SHA;
- generated SBOM and dependency/image vulnerability findings;
- migration plan and backward-compatibility assessment;
- container image digests and deployment manifest revision;
- configuration/secret version references without secret values;
- integration and smoke-test reports;
- dashboard/alert/runbook links;
- rollback decision and tested procedure;
- backup/restore evidence and measured RPO/RTO;
- owner-approved list of residual risks.

## 6. Explicit non-claims

Unless supported by current evidence, this repository does **not** claim:
- production deployment or cloud resources exist;
- high availability, autoscaling effectiveness, or disaster recovery have been tested;
- backups can be restored within a target RTO/RPO;
- queue processing is exactly-once;
- all gateway upstreams are exposed and protected;
- all API operations have consistent authentication and authorization;
- all services have end-to-end observability;
- all tests or CI workflows pass;
- the application meets a defined SLO or capacity target.

This ledger should be updated only when evidence changes, not to make a release narrative sound stronger.


## 7. Security, reliability, and performance hardening revision

The follow-on engineering revision adds a threat model, proposed SLO/error-budget policy, CPU/memory profiling and benchmark protocol, incident response and backup/restore runbooks, production readiness gates, weekly Dependabot coverage for repository ecosystems, and a GitHub Actions workflow for secret/dependency/Go/Python/filesystem security scans. The AI request-metrics middleware no longer linearly scans every registered route on the request completion path when router metadata is absent; it uses the bounded `unmatched` label instead. The Go gateway and jobs API now cap HTTP request header parsing at 1 MiB. Kubernetes application manifests now set a RuntimeDefault seccomp profile, non-root UID/GID 10001, no privilege escalation, and drop Linux capabilities for the five API/worker workloads in the local and AWS overlays. Corresponding service Dockerfiles use explicit numeric non-root identities. The NestJS service image now separates build-time and production npm dependencies and copies only the runtime dependency set plus compiled Prisma output.

Static verification for this revision: 62 YAML/YML files parsed with duplicate-key detection; 13 strict JSON files parsed; 43 non-archived JavaScript files passed `node --check`; all 68 Python files passed `py_compile`; all 42 Go files are gofmt-clean; 88 relative Markdown links across 36 Markdown files resolved; and structural assertions passed for the 10 hardened Kubernetes deployment manifests. `pytest -q services/ai-service/tests/test_health.py` could not collect without a configured database URL; with a dummy URL it still could not collect because `asyncpg` is absent from the available interpreter. Full Node dependency tests, Go tests, Docker builds, Kustomize rendering, vulnerability scans, load/soak tests, backup restores, and deployment drills were not run. The local environment has no Docker/Kustomize toolchain and Go 1.23.2 is older than the modules' declared versions. These are source/configuration changes, not evidence that the new CI workflow passes or that Relay is production-ready. The security workflow may surface existing dependency or secret findings that must be triaged before merge. The proposed SLOs are starting targets only and must be approved and measured.


## 8. Native mobile companion revision

Added `apps/mobile/` as an Expo-managed React Native client with login/signup, secure-store session persistence, contacts and presence, cursor-paginated text messaging, realtime incoming messages, and AI answers with citations. Dedicated `/api/auth/mobile/login` and `/api/auth/mobile/signup` endpoints preserve the browser auth response contract while returning a bearer token to the native client. Express HTTP auth and Socket.IO handshake auth now accept the bearer token; the AI origin guard permits bearer-authenticated requests after authentication middleware has validated the token. OpenAPI now declares a bearer scheme. The messages API now bounds conversation reads to 1–100 items (default 50), supports a timestamp/ObjectId cursor with stable ordering, exposes pagination headers, and sends `Cache-Control: no-store`; this contract supports both the existing web store and native older-page loading. The mobile guide and architecture/security document describe setup, API connectivity, known session revocation limitations, performance budgets, and remaining parity work.

Static checks performed for this revision: `node --check` passed for the changed Express controllers, route, middleware, socket module, AI route, Swagger schema, and Expo dynamic config; 10 mobile TypeScript/TSX files passed syntax transpilation; 16 strict-JSON files parsed (TypeScript JSONC configs excluded); 62 YAML/YML files parsed with duplicate-key detection; and 98 relative Markdown links across 38 Markdown files resolved. Mobile dependency lockfile generation timed out in the available environment, so no mobile `package-lock.json` was generated. Expo dependencies could not be installed here; TypeScript checks, Expo prebuild, iOS/Android builds, end-to-end API auth, realtime reconnect behavior, and physical-device profiling remain unverified. Native logout removes the local seven-day stateless JWT but does not revoke a copied token; a refresh-token rotation/revocation design is required before claiming enterprise-grade session revocation. Mobile functionality currently covers messaging and AI only, not full parity with every web operations route.
