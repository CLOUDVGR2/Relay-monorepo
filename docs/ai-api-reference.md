# Relay API and AI Service Reference

## Public gateway surface

The Go gateway currently registers these route families:

| Method | Path | Destination |
|---|---|---|
| Any proxied method | `/api`, `/api/*` | Express API |
| Any proxied method | `/socket.io/*` | Express Socket.IO |
| Any proxied method | `/graphql`, `/graphql/*` | NestJS GraphQL |
| Any proxied method | `/jobs`, `/jobs/*` | NestJS jobs controller |
| Any proxied method | `/calls`, `/calls/*` | NestJS recording/call HTTP controller |
| GET | `/healthz` | Gateway liveness |
| GET | `/readyz` | Gateway dependency readiness |
| GET | `/gateway/openapi.json` | Gateway OpenAPI |
| GET | `/gateway/docs` | Gateway Swagger UI |

NestJS additionally serves `/docs` and `/health` through its registered gateway routes. The gateway does not publish the Go Jobs API's internal routes or the Python service's `/v1` API as general public routes.

## Express API

Express route families include:
- `/api/auth` — signup, login, mobile signup/login, logout, session check, profile update;
- `/api/messages` — user lookup, message history, send, read, and update operations;
- `/api/notifications` — device token, preferences, list, and read state;
- `/api/incidents` — incident workflow integration;
- `/api/ai` — answer, documents, search, runs, and multi-agent task facade;
- `/internal` — internal call-event integration.

The exact method, middleware, and request schema are defined by route modules and Swagger output.

## NestJS API

GraphQL resolvers provide:
- conversation list, paginated messages, create/hide/update conversation, participant management, and message creation;
- task create/list/update, checklist item operations, and task-link operations;
- call create/accept/decline/end, call history/session, summary generation, and history deletion.

REST controllers provide health/readiness, jobs operations, call recording upload lifecycle, and internal media-session authorization.

## Python AI API

The FastAPI application exposes:
- `GET /healthz`, `GET /readyz`, and `GET /v1/ai/status`;
- `/v1/incidents` lifecycle routes for incident creation, investigation, approval, execution, recovery, and detail;
- conversation analysis route under the conversation-analysis router;
- `/v1/documents` ingestion, search, answer, list, and detail operations;
- `/v1/multi-agent/tasks` create, list, and detail operations;
- protected `/internal/metrics`.

Protected AI endpoints require an internal bearer token. Tenant-scoped document, incident, and task operations also require `X-Relay-User-Id`. Health/readiness are intentionally unauthenticated for orchestration.

## Go Jobs API

The Jobs API exposes liveness, readiness, RabbitMQ health, worker health, and internal job submission/status routes. Internal job operations require `Authorization: Bearer <INTERNAL_API_TOKEN>`. Its route contract and request limits are documented in `services/jobs-api/README.md`.

## API documentation endpoints

- Gateway OpenAPI: `/gateway/openapi.json`
- Gateway Swagger UI: `/gateway/docs`
- NestJS Swagger UI: `/docs`
- Express Swagger UI: `/api-docs`
- Python OpenAPI: `/openapi.json`, with `/docs` and `/redoc`

Use the live OpenAPI/GraphQL schema from the target build when implementing clients; this document is a navigation map, not a replacement for generated schemas.
