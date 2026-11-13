# Repository Structure and Ownership

## Workspace organization

Relay uses a pnpm workspace for JavaScript/TypeScript packages and independent native toolchains for Go and Python services.

| Path | Ownership | Key artifacts |
|---|---|---|
| `apps/web/` | Browser UI | React pages/components, state stores, styles, Vite, Vitest, Playwright |
| `apps/mobile/` | Native UI | Expo config, React Native screens, hooks, API/realtime libraries, native build config |
| `services/api-gateway/` | Edge application routing | Go server, proxy policy, config, metrics, tests |
| `services/express-api/` | Collaboration API | Express routes/controllers, models, auth, Socket.IO, Redis, metrics |
| `services/nest-api/` | Domain API | Nest modules, GraphQL resolvers, REST controllers, DTOs, Prisma/Mongoose |
| `services/jobs-api/` | Job HTTP contract | Gin routes, publisher, Redis status, OpenAPI |
| `services/jobs-worker/` | Queue execution | AMQP consumer, handler, retries, idempotency, heartbeat |
| `services/ai-service/` | AI and automation | FastAPI routes, RAG, agent workflows, migrations, recording and multi-agent workers |
| `infrastructure/` | Delivery and runtime | Terraform, Kustomize, Dockerfiles, Jenkins |
| `monitoring/` | Telemetry provisioning | Prometheus, Blackbox Exporter, Grafana datasource |
| `tests/` | Cross-component validation | Integration, E2E, and performance test contracts |
| `docs/` | Engineering knowledge | Architecture, API, security, reliability, operations, ADRs |

## Build-system boundaries

- Root `package.json` provides workspace scripts and aggregate commands.
- `pnpm-workspace.yaml` declares package discovery.
- `pnpm-lock.yaml` is the dependency-resolution source for pnpm packages.
- Each Go service owns its `go.mod` and `go.sum`.
- The Python AI service owns runtime/development requirements, pytest configuration, and Alembic migrations.
- Dockerfiles define container build contexts and runtime entrypoints.
- Kustomize overlays compose environment-specific Kubernetes resources.

## Configuration ownership

The root `.env.example` documents shared local configuration. Service-level examples and manifests may define additional variables. The consuming service's config parser and deployment manifest are authoritative for variable names, defaults, and validation.

## Repository navigation

Start at the service boundary, then trace:
1. public route or GraphQL resolver;
2. DTO/schema validation;
3. service/business logic;
4. repository/model or external adapter;
5. tests;
6. container and deployment configuration.

This sequence exposes the contract from ingress through persistence and runtime packaging.
