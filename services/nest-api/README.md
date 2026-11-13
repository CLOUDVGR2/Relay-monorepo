# Relay NestJS Domain API

## Service responsibility

The NestJS API owns GraphQL conversation, task, and call operations plus REST endpoints for jobs, health, media-session authorization, and recording upload lifecycle. It is a separate domain service from the Express collaboration API.

## Module map

- `auth/` — JWT validation, HTTP and GraphQL guards, current-user context.
- `conversations/` — conversation, message, task, call, media authorization, and recording upload domains.
- `jobs/` — authenticated facade over the Go Jobs API.
- `ai/` — AI service integration.
- `prisma/` — Prisma client lifecycle.
- `health/` — liveness/readiness endpoints.
- `common/` — request context, timing, error filtering, DTOs, and guards.
- `observability/` — Prometheus metrics.
- `config/` — environment validation.

## GraphQL domains

Conversation operations include listing, paginated message retrieval, conversation creation and hiding, metadata updates, participant management, and message creation.

Task operations include task creation/listing/update, checklist item lifecycle, and task-link lifecycle.

Call operations include create, accept, decline, end, call history/session retrieval, summary generation, and call-history deletion.

Resolvers use authenticated GraphQL guards and derive the acting user from the verified request context.

## REST domains

Controllers provide application health, readiness, job submission/status, call recording upload creation/completion/refresh, and internal media-session authorization. Recording completion validates server-side upload state and metadata before finalizing the durable recording record.

## Persistence and integrations

The service uses PostgreSQL through Prisma for relational records and MongoDB/Mongoose for selected document-oriented records. Redis provides selected coordination. Integrations include the Go Jobs API, Python AI API, Express internal call-event endpoint, and S3-compatible recording storage.

## Development and verification

```bash
pnpm --dir services/nest-api start:dev
pnpm --dir services/nest-api build
pnpm --dir services/nest-api test
pnpm --dir services/nest-api test:e2e
pnpm --dir services/nest-api lint
```

Run focused tests for resolver authorization, call state transitions, recording upload idempotency, storage behavior, configuration validation, and health semantics.
