# Relay API and AI Service Reference

This reference separates public ingress paths from internal service endpoints. Route prefixes are composed by the Gateway, Express mount points, Nest controllers, and Python FastAPI routers; a path existing in an upstream service does not automatically make it public.

## 1. Ingress map

| Client-visible path | Current Gateway target | Owner |
|---|---|---|
| `/api/**` | Express API | Express route modules |
| `/socket.io/**` | Express API | Socket.IO runtime |
| `/graphql` | NestJS API | Nest GraphQL resolvers |
| `/calls/**` | NestJS API | Nest call/recording controllers |
| `/jobs/**` | NestJS API | Nest JobsController facade |
| `/health/**` | NestJS API | Nest HealthController |
| `/docs/**` | NestJS API | Nest Swagger |
| `/healthz`, `/readyz` | Gateway-local | Go Gateway |
| `/gateway/docs`, `/gateway/openapi.json` | Gateway-local | Go Gateway |

The Gateway does not register direct routes to the Go Jobs API or Python AI API. NGINX adds selected local diagnostic paths in `apps/web/nginx.conf`; those are NGINX routes and should be documented separately from the Gateway allowlist.

## 2. Express public API

Express mounts route modules as follows:

| Public path | Methods / operations | Notes |
|---|---|---|
| `/api/auth` | Signup, mobile signup, login, mobile login, logout, profile update, session check | Browser cookie/session and native bearer modes |
| `/api/messages` | User lookup, message history, send, read, edit | Protected user/conversation operations |
| `/api/notifications` | List, mark read, read all, preferences, device-token registration/removal | Device token and preferences are authenticated user data |
| `/api/incidents` | Create/list/detail/investigation/approval/execution/recovery facade operations | See route module for exact request fields |
| `/api/ai/answer` | `POST` grounded answer | Question length max 2,000; `top_k` 1–20, default 5; AI rate limiter |
| `/api/ai/documents` | `POST` ingest, `GET` list | Ingest title max 500, content max 1,000,000 characters, optional URI max 2,048 |
| `/api/ai/documents/search` | `POST` search | Query max 2,000; `top_k` 1–20 |
| `/api/ai/multi-agent/tasks` | `POST`, `GET` | Prompt max 4,000, `max_steps` 1–12, timeout max 240 seconds; pagination |
| `/api/ai/multi-agent/tasks/:taskId` | `GET` | Public task status/result contract |
| `/api/ai/runs` | `GET` | Authenticated execution history |
| `/api/ai/metrics` | `GET` | Protected operational metric surface as configured |
| `/api/health/live` | `GET` | Express liveness |
| `/api/health/ready` | `GET` | Express readiness, includes MongoDB connection state |
| `/api/health/redis` | `GET` | Bounded Redis connectivity probe |
| `/internal/call-events` | `POST` | Internal call-event integration; not a client route |

The public `/api` paths require the Express authentication and trusted-origin policies implemented by their route/middleware composition. Native clients use the bearer-token path. Browser cookie behavior and CORS configuration must match the deployed origin.

## 3. NestJS API

### REST controllers

| Path | Method | Purpose | Guard / scope |
|---|---|---|---|
| `/health` | `GET` | Basic health | Health controller |
| `/health/ready` | `GET` | Readiness | Health controller |
| `/jobs` | `POST` | Submit a welcome job through Go Jobs API | HTTP JWT guard; user identity propagated to downstream owner context |
| `/jobs` | `GET` | List authenticated user's jobs | HTTP JWT guard; owner-scoped |
| `/jobs/:id` | `GET` | Read job details | HTTP JWT guard; owner-scoped |
| `/ai/answer` | `POST` | Answer from the Knowledge Base through Python AI service | HTTP JWT guard; passes authenticated user ID |
| `/calls/:callId/recording` | `GET` | Read recording information / access path | Authenticated call domain |
| `/calls/:callId/recording-upload` | `POST` | Create recording upload session | Authenticated call domain |
| `/calls/recording-uploads/:uploadId/refresh` | `POST` | Refresh upload session | Authenticated upload ownership |
| `/calls/recording-uploads/:uploadId/complete` | `POST` | Complete upload and validate metadata | Authenticated upload ownership |
| `/internal/media-sessions/authorize` | `POST` | Internal media-session authorization | Internal integration policy |

The Gateway route allowlist forwards `/jobs`, `/calls`, `/health`, and `/docs` to NestJS. The current Gateway table does not list `/ai`, so Nest's `/ai/answer` route is not a Gateway-exposed path in this snapshot. The commonly used web/mobile AI facade is Express `/api/ai/answer`.

### GraphQL

Nest resolvers expose the following named operations (check the generated schema for field arguments and nullability):

- **Conversations:** `conversations`, `conversationMessages`, `createConversation`, `hideConversation`, `updateConversationDetails`, `addConversationParticipants`, `createMessage`, and the `messages` field resolver.
- **Tasks:** `listTasks`, `createTask`, `updateTask`, `addTaskChecklistItem`, `updateTaskChecklistItem`, `deleteTaskChecklistItem`, `addTaskLink`, `deleteTaskLink`.
- **Calls:** `createCall`, `acceptCall`, `declineCall`, `endCall`, `generateCallSummary`, `deleteCallHistory`, `callHistory`, `callSession`.
- **Base resolver:** `hello` is a scaffold/diagnostic query; do not treat it as a product capability.

GraphQL HTTP authentication and resolver-level ownership rules must be verified independently of REST controller guards.

## 4. Python AI internal API

Base service: `services/ai-service/app/main.py`. OpenAPI JSON: `/openapi.json`; interactive docs: `/docs`; alternative docs: `/redoc`.

### Health and status

| Method | Path | Auth | Semantics |
|---|---|---|---|
| `GET` | `/healthz` | None | Process/application liveness |
| `GET` | `/readyz` | None | Dependency readiness as implemented |
| `GET` | `/v1/ai/status` | Internal bearer | AI provider/configuration status |
| `GET` | `/internal/metrics` | Internal bearer | Process-local HTTP counters and latency samples |

### Knowledge Base

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/v1/documents` | Internal bearer + `X-Relay-User-Id` | Ingest document into uploader's tenant |
| `GET` | `/v1/documents` | Internal bearer + `X-Relay-User-Id` | List the requesting user's tenant documents |
| `GET` | `/v1/documents/{document_id}` | Internal bearer + `X-Relay-User-Id` | Fetch a document within the requesting user's tenant |
| `POST` | `/v1/documents/search` | Internal bearer + valid Relay ID context | Search cross-tenant shared corpus in current implementation |
| `POST` | `/v1/documents/answer` | Internal bearer + valid Relay ID context | Grounded answer over the same shared retrieval scope |

Search and answer currently pass `tenant_id=None` into the retrieval implementation, meaning both vector and full-text candidate queries omit the tenant predicate. Document ingest/list/direct fetch continue to resolve a per-user tenant. This is a deliberate shared Knowledge Base behavior in the supplied code, but it is not a document-level authorization system.

### Conversation analysis

| Method | Path | Auth | Bounds |
|---|---|---|---|
| `POST` | `/v1/conversations/analyze` | Internal bearer | 1–100 messages, aggregate transcript ≤ 50,000 characters; message sender/text limits are validated in the Nest integration |

Response fields are `summary`, `decisions`, and `action_items` with task, owner and due-date values as defined by the Pydantic schema.

### Incident intelligence

Base path: `/v1/incidents`; internal bearer and `X-Relay-User-Id` tenant context required.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/incidents` | Create incident for the currently implemented `api-latency-spike-v1` scenario |
| `GET` | `/v1/incidents` | List tenant incidents |
| `GET` | `/v1/incidents/{incident_id}` | Read tenant incident |
| `POST` | `/v1/incidents/{incident_id}/investigate` | Run investigation workflow |
| `POST` | `/v1/incidents/{incident_id}/approve` | Approve eligible remediation action |
| `POST` | `/v1/incidents/{incident_id}/execute` | Execute approved action |
| `POST` | `/v1/incidents/{incident_id}/recover` | Recover/close incident workflow |

The service separates investigation, approval, execution and recovery. Creating an incident does not by itself execute a remediation.

### Multi-agent tasks

Base path: `/v1/multi-agent/tasks`; internal bearer and Relay user tenant context required.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/multi-agent/tasks` | Validate and enqueue task |
| `GET` | `/v1/multi-agent/tasks` | List tenant tasks, with bounded pagination |
| `GET` | `/v1/multi-agent/tasks/{task_id}` | Read task status/result |

The public task request accepts a prompt up to 4,000 characters, `max_steps` from 1–12 (default 8), and `timeout_seconds` up to 240 (default per route contract). Worker lease and internal coordination fields are excluded from the public task response.

## 5. Go Jobs API

The Go Jobs API has its own listener and route contract. Its internal job routes are not directly published by the Go Gateway allowlist in this snapshot.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/healthz` | None | Liveness |
| `GET` | `/rabbitmqz` | None | Broker health |
| `GET` | `/readyz` | None | Required dependencies and worker readiness when configured |
| `GET` | `/worker-health` | None | Worker heartbeat snapshot |
| `POST` | `/internal/v1/jobs` | Internal bearer | Submit job |
| `GET` | `/internal/v1/jobs` | Internal bearer | Job history when status store is configured |
| `GET` | `/internal/v1/jobs/:id` | Internal bearer | Job detail when status store is configured |

The NestJS JobsController provides an authenticated user-facing facade and uses the Go API integration. The worker currently handles `welcome` jobs.

## 6. Documentation surfaces

- Gateway: `/gateway/openapi.json`, `/gateway/docs`
- Express: `/api-docs` (Swagger UI)
- NestJS: `/docs` (Swagger UI) and GraphQL schema
- Python: `/openapi.json`, `/docs`, `/redoc`
- Go Jobs API: `/openapi.json`, `/docs`

Use generated OpenAPI/GraphQL schemas from the target build when implementing clients. This guide is a route ownership map, not a replacement for schema inspection.

## 7. Authentication rules

1. User-facing routes authenticate the Relay user at Express or Nest.
2. Server-to-server calls use separate internal bearer credentials.
3. `X-Relay-User-Id` is a tenant/user context header consumed by Python after the internal service token is validated.
4. Do not send internal tokens to browser/mobile code or `EXPO_PUBLIC_*` variables.
5. A route in an internal service OpenAPI document is not public unless a gateway/proxy route exposes it and the deployment policy permits it.
