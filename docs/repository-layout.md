# Repository Structure, Ownership, and Navigation

Relay is a polyglot monorepo: JavaScript/TypeScript projects share a pnpm workspace, while Go and Python services retain independent toolchains. The repository is the integration boundary, not a single deployable process.

## 1. Top-level map

| Path | Responsibility | Primary owners / changes |
|---|---|---|
| `apps/web/` | React/Vite browser application and NGINX runtime | Web product, accessibility, browser API integration |
| `apps/mobile/` | Expo / React Native native client | Mobile experience, device permissions, media and native lifecycle |
| `services/api-gateway/` | Go edge proxy and public route allowlist | Routing, trusted proxy, transport limits, gateway metrics |
| `services/express-api/` | Express collaboration API and Socket.IO | Authenticated collaboration routes, user model, notifications, AI adapter |
| `services/nest-api/` | NestJS domain API, REST, GraphQL, Prisma | Conversations, tasks, calls, recording lifecycle, AI and jobs facade |
| `services/jobs-api/` | Go HTTP job publisher/status API | Job submission contract, broker publishing, status/health endpoints |
| `services/jobs-worker/` | Go RabbitMQ consumer | Job execution, idempotency, retry, heartbeat, recovery |
| `services/ai-service/` | Python FastAPI AI/RAG/agent operations | Document ingestion/retrieval, answer generation, agent workflows, migrations |
| `services/ai-service/migrations/` | Alembic migration history | Python service schema evolution |
| `infrastructure/aws/` | Terraform and IAM policy templates | AWS foundation, registry, identity, recording storage |
| `infrastructure/kubernetes/` | Kustomize base and overlays | Kubernetes workload composition and environment patches |
| `infrastructure/deploy/` | deployment/render helpers and Docker assets | artifact/config rendering |
| `infrastructure/devops/` | Jenkins assets | optional/legacy pipeline integration; verify whether used |
| `monitoring/` | Prometheus and Blackbox configuration | scrape targets and probes |
| `tests/` | integration, end-to-end, and performance test contracts | cross-service quality |
| `.github/workflows/` | GitHub Actions workflows | CI, security, publishing, infrastructure validation |
| `docs/` | architecture, operations, product, security, decision records | shared system of record for engineering knowledge |

## 2. Toolchain boundaries

| Runtime | Dependency / build root | Typical test command |
|---|---|---|
| Workspace Node/TypeScript | root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | `pnpm run test:all` or package-specific test |
| Web | `apps/web/package.json` | `pnpm --filter @relay/web run test` |
| Mobile | `apps/mobile/package.json` | `pnpm --filter @relay/mobile run typecheck` plus device/emulator testing |
| Express | `services/express-api/package.json` | `pnpm --filter @relay/express-api run test:integration` |
| NestJS | `services/nest-api/package.json` | `pnpm --filter @relay/nest-api run test` |
| Go Gateway | `services/api-gateway/go.mod` | `(cd services/api-gateway && go test ./...)` |
| Go Jobs API | `services/jobs-api/go.mod` | `(cd services/jobs-api && go test ./...)` |
| Go Worker | `services/jobs-worker/go.mod` | `(cd services/jobs-worker && go test ./...)` |
| Python AI | `services/ai-service/requirements*.txt`, `alembic.ini` | `.venv/bin/python -m pytest tests/` from service root |

Do not assume a root pnpm command installs Go or Python dependencies. Pin and validate each toolchain independently.

## 3. Key navigation paths

- Start with [the platform dossier](enterprise-technical-dossier.md) for architecture and hiring-manager review.
- Use [architecture](architecture.md), [service catalogue](architecture/service-catalog.md), and [request flows](architecture/request-flows.md) for system boundaries.
- Use [API reference](ai-api-reference.md) and the service READMEs for endpoint-specific behavior.
- Use [data architecture](data-architecture.md) for persistence ownership and data flows.
- Use [security and operations](security-and-operations.md) and the threat model for trust boundaries.
- Use [production guide](production-guide.md), [readiness gates](production-readiness-gates.md), and [incident response](operations/incident-response.md) for operations.
- Use [ADRs](decisions/README.md) for durable historical design decisions.

## 4. Change ownership and impact analysis

Before changing a boundary, identify:

1. source owner and public contract;
2. gateway/frontend/mobile consumers;
3. persistence model and migration path;
4. authentication and authorization path;
5. async events and workers;
6. telemetry and runbook impact;
7. tests and rollout compatibility.

A cross-service feature generally requires contract tests and documentation updates in the same pull request. Do not place business logic in the Gateway; do not bypass domain service authorization by calling an internal service from a client.

## 5. Documentation maintenance

Documentation is part of the change contract. Update route tables when routes change, data-flow diagrams when ownership changes, deployment guides when manifest semantics change, and ADRs when a durable architectural choice is introduced or superseded.
