# Relay Testing Strategy

**Purpose:** define how Relay changes are verified across multiple languages, public contracts, persistence layers, clients, workers, and infrastructure. A passing test proves only the behavior exercised under its fixture and environment; it is not a production certification.

## 1. Test pyramid and contract layers

| Layer | Purpose | Typical implementation |
|---|---|---|
| Unit | deterministic domain logic, validation, parsers, state transitions | Vitest, Go `testing`, pytest |
| Component | UI states, accessibility, interactions, and API adapters | Vitest and React testing tools |
| API integration | middleware, auth, persistence, service adapters | Node test runner, Supertest/Vitest, pytest |
| Contract | REST, GraphQL, Socket.IO, AMQP and internal service compatibility | OpenAPI/schema assertions, fixture tests, integration tests |
| End-to-end | user-visible cross-component journeys | Playwright and service E2E suites |
| Reliability | retries, duplicate delivery, reconnect, graceful shutdown, restore | Go reliability tests and integration suites |
| Infrastructure | manifest rendering, schema, Terraform validation, secret scanning | Kustomize, kubeconform, Terraform, security workflows |
| Performance | latency, throughput, saturation, cost, and soak profiles | defined workload scripts and retained reports |

## 2. Required scenario matrix

### Identity and authorization

- valid, invalid, expired, and revoked session/token;
- deleted user with otherwise valid token;
- browser cookie vs native bearer path;
- untrusted Origin and trusted proxy spoofing;
- user ownership/participant authorization at each API boundary;
- internal token missing/invalid and forged Relay identity header.

### Collaboration and realtime

- conversation creation, membership, message send/history pagination;
- read state and duplicate submission behavior;
- Socket.IO connection, reconnect, stale session, room access, and event delivery;
- Redis unavailable and Mongo persistence failure.

### GraphQL and domain API

- DTO validation, auth guard, pagination bounds, nested resolver behavior;
- task/checklist/link invariants;
- call lifecycle transition matrix and participant authorization;
- GraphQL error shape and compatibility for web/mobile clients.

### Recording

- consent acceptance/decline and server media authorization;
- upload session creation/refresh/completion;
- idempotent completion and duplicate track handling;
- invalid metadata, content type, checksum/size/duration, timeout, and storage failure;
- local recovery, worker restart, transcription failure, and retry.

### Jobs

- valid/invalid job schema and internal auth;
- publish confirmation and broker outage;
- duplicate delivery and idempotency failure;
- retry routing, DLQ, status persistence, heartbeat loss;
- worker restart, reconnect, prefetch, and graceful shutdown.

### Knowledge and AI

- upload validation, chunking, embedding failure, and dimension mismatch;
- tenant-scoped document management operations;
- authenticated shared-corpus search/answer behavior;
- uploader attribution derived from trusted document-owner identity;
- vector/full-text retrieval, ranking, empty results, and overlap handling;
- citation ID validation and abstention;
- factual answer regression tests for category/weekday ambiguity;
- provider timeout, invalid JSON, and model unavailability.

The shared Knowledge Base scope is security-sensitive. Include tests proving intended cross-user retrieval and tests proving document management endpoints remain correctly scoped. Attribution does not replace authorization.

## 3. Test data and environment isolation

Use synthetic identities, synthetic documents, generated media, and isolated namespaces. Do not use production personal data in fixtures. Test database state must be deterministic and cleaned up or uniquely namespaced. Internal credentials should be ephemeral test secrets.

Avoid tests that depend on local model availability unless explicitly marked as provider integration tests. Unit tests should use fakes for embedding/generation clients and assert the behavior contract.

## 4. Toolchain commands

From the repository root, the configured scripts include:

```bash
pnpm install --frozen-lockfile
pnpm run build:all
pnpm run test:all
pnpm run typecheck:mobile
pnpm run test:e2e:web
pnpm run test:e2e:nest-api
```

Focused commands:

```bash
pnpm --filter @relay/web run lint
pnpm --filter @relay/web run test
pnpm --filter @relay/web run build
pnpm --filter @relay/mobile run typecheck
pnpm --filter @relay/express-api run test:integration
pnpm --filter @relay/nest-api run test
(cd services/api-gateway && go test ./...)
(cd services/jobs-api && go test ./...)
(cd services/jobs-worker && go test ./... -count=1)
(cd services/ai-service && .venv/bin/python -m pytest tests/ -v)
```

The AI service test command requires a service virtual environment and development requirements including pytest. Do not assume the host Python has pytest installed.

## 5. CI interpretation

The repository defines multiple workflows for web CI, Go worker CI/publication, Kubernetes validation, security/supply-chain scanning, and Terraform validation. Their branch/path triggers are not all identical. Review each workflow's trigger and required-check setting before claiming a single consolidated gate. The existence of a workflow does not prove that a specific commit passed it; inspect the workflow run associated with the commit SHA.

## 6. Quality evidence format

For each test run retain:

- source commit SHA and artifact identity;
- exact command/workflow and tool versions;
- environment and service dependencies;
- test count and pass/fail/skip summary;
- coverage output where produced;
- logs/reports and known exclusions;
- incident or flaky-test follow-up.

## 7. Release quality policy

- No merge with known failing required checks without an approved exception.
- Contract changes require consumer impact analysis.
- Data migrations require an upgrade/restore strategy.
- Security regressions and secret leaks block release.
- Test gaps affecting auth, tenant boundaries, media, payments/financial-like flows if later added, or data loss must be explicit release risks.
- Performance claims require reproducible reports, not anecdotal measurements.
