# Relay NestJS Domain API

**Runtime:** Node.js / NestJS / TypeScript
**Persistence:** PostgreSQL through Prisma, plus integration with Mongo-backed identity and Redis coordination
**Interfaces:** REST, GraphQL, authenticated internal/service routes.

## 1. Domain ownership

The NestJS API owns collaboration domain operations that benefit from module boundaries, GraphQL composition, relational consistency, and lifecycle orchestration. It is distinct from the Express API, which owns the established Express/Socket.IO collaboration routes.

| Module area | Responsibility |
|---|---|
| `auth/` | token validation, HTTP/GraphQL guards, current-user context |
| `conversations/` | conversation, messages, participants, tasks, calls, recording lifecycle domains |
| `jobs/` | authenticated facade to the internal Go Jobs API |
| `ai/` | authenticated AI answer controller/service integration |
| `health/` | process health and readiness endpoints |
| `prisma/` | Prisma client lifecycle and database access |

The actual module graph and route decorators are the source of truth when a route is added or moved.

## 2. GraphQL and REST

GraphQL resolvers expose conversation, paginated message, conversation mutation/participant, task, checklist, and task-link operations. REST controllers expose health, jobs facade, call/recording operations, and AI integration as implemented in the controller modules.

The Go Gateway maps `/graphql`, `/jobs`, and `/calls` to NestJS. It does not expose every Nest internal route by default. Route decorators and Gateway allowlist must be changed together when public routing changes.

## 3. Authentication and authorization

HTTP and GraphQL guards validate the user credential and establish a current-user context. Domain queries and mutations must scope data to the authenticated participant/owner. Internal routes use separate service-to-service authentication and should not be exposed through public ingress without a deliberate review.

The Nest AI endpoint is authenticated and delegates to Python using the internal service credential and trusted Relay user identity. The Python service remains the RAG/AI execution boundary.

## 4. Persistence

Prisma schema and migrations describe conversations, messages, participants, tasks/checklists/activity/links, call sessions/participants, recording state/uploads/tracks, transcripts, summaries, and processing jobs. Review schema relations and migration compatibility before changing data ownership or deletion semantics.

## 5. Calls and recording lifecycle

The call domain includes lifecycle transitions, participant recording consent, server-side media-session authorization, recording upload creation/refresh/completion, recording track state, and downstream transcript/summary processing. A successful upload request is not equal to a completed processing result. Preserve lifecycle transitions and idempotency when retrying.

See [ADR 0002](../../docs/decisions/0002-call-recording-transcription-and-summaries.md) and [data architecture](../../docs/data-architecture.md).

## 6. Jobs facade

The Nest jobs module presents authenticated user-facing job operations while the internal Go Jobs API handles broker submission/status and the Go worker performs background execution. Do not expose raw broker or internal Jobs API credentials to clients.

## 7. AI controller

The AI module provides an authenticated answer endpoint that delegates to the Python AI service. The endpoint returns an answer and evidence citations, plus uploader display attribution from the Express-backed response path where applicable. Keep answer grounding, identity propagation, and citation validation server-side.

## 8. Local development and tests

```bash
pnpm --filter @relay/nest-api run start:dev
pnpm --filter @relay/nest-api run test
pnpm --filter @relay/nest-api run test:e2e
pnpm --filter @relay/nest-api run build
```

The service requires PostgreSQL, configured authentication/integration secrets, and other dependencies shown in its `.env.example` and Compose service. Use Prisma migration commands defined by the package scripts; inspect `schema.prisma` and migration history before running destructive actions.

## 9. Operational priorities

Monitor GraphQL operation latency/errors, REST route latency, Prisma pool/database health, auth failures, media-session authorization, upload completion, recording processing, AI provider timeout, and Go Jobs API dependency health. Use low-cardinality operation names and do not log tokens or full transcript/media payloads.
