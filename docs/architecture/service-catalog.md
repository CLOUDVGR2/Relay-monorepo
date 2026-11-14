# Relay Service Catalog

This catalog defines the engineering ownership boundary for each deployable application or worker. The code and Compose/Kubernetes manifests remain authoritative for exact configuration.

## Service summary

| Workload | Runtime | Process type | Main port/interface | Primary responsibility |
|---|---|---|---|---|
| Web | React/Vite + NGINX | Static SPA + proxy | NGINX 8080 container | Browser UI |
| Mobile | Expo/React Native | Development server / native app | Metro 8081 in Compose | Android/iOS UI and device integration |
| API Gateway | Go | HTTP reverse proxy | 8090, metrics listener 9091 | Public route policy |
| Express API | Node/Express/Socket.IO | HTTP + realtime | 5001 | Identity, messaging, notifications, AI facade, internal call events |
| NestJS API | Node/NestJS | HTTP + GraphQL | 3000 | Conversation, task, call, jobs, recording, AI domain APIs |
| Go Jobs API | Go/Gin | HTTP | 8081, metrics 9091 | Internal job submission and status |
| Go Jobs Worker | Go | RabbitMQ consumer | No public HTTP listener | Supported job processing, retry and idempotency |
| Python AI API | Python/FastAPI | HTTP | 8000 | RAG, incident intelligence, conversation analysis, multi-agent API |
| Multi-agent Worker | Python | Background worker | No public HTTP listener | Persisted task execution |
| Recording Worker | Python | Background worker | No public HTTP listener | Audio transcription/analysis pipeline |
| MongoDB | MongoDB | Database | 27017 | User and collaboration document data |
| PostgreSQL | PostgreSQL + pgvector | Database | 5432 | Domain and AI relational/vector data |
| Redis | Redis | Key/value and coordination | 6379 | Cache and ephemeral coordination |
| RabbitMQ | RabbitMQ | Broker | 5672; management 15672 | Asynchronous jobs |
| RustFS | S3-compatible storage | Object store | 9000 | Local object storage for media integration |
| Prometheus | Prometheus | Metrics server | 9090 | Scrape and retain configured metrics |
| Grafana | Grafana | Dashboard server | 3000 container | Metrics visualization |
| Blackbox Exporter | Prometheus exporter | Probe service | 9115 internal | HTTP probes |
| cAdvisor | Container metrics | Agent | 8080 internal | Container resource metrics |

## Client workloads

### Web — `apps/web`

- **Build:** `pnpm --dir apps/web run build`
- **Development:** `pnpm --dir apps/web dev`
- **Tests:** Vitest and Playwright configuration.
- **Production container:** Vite build stage copies `dist/` into NGINX.
- **Navigation and feature surfaces:** authentication, collaboration/chat, profile, AI assistant, jobs, analytics, infrastructure and operational workspace.
- **Boundary:** UI state is not a substitute for server authorization.

### Mobile — `apps/mobile`

- **Build/runtime:** Expo SDK and React Native TypeScript.
- **Development:** `pnpm dev:mobile` or `pnpm --dir apps/mobile start`.
- **Typecheck/lint:** `pnpm typecheck:mobile`, `pnpm --dir apps/mobile lint`.
- **Device dependencies:** network-reachable API origin, notification permission/token handling, audio/media permissions and WebRTC/media support.
- **Boundary:** device-local caches and recording recovery need explicit retention, encryption and lifecycle review.

## API services

### API Gateway — `services/api-gateway`

The Gateway is deliberately not an API aggregation layer. It forwards a fixed allowlist, propagates request IDs, handles trusted proxy metadata, applies Gateway-owned response headers, uses bounded upstream behavior and exposes local health/readiness. The route table is defined in `server.go`; config/defaults are in `config.go`.

Commands from `services/api-gateway/`:

```bash
go test ./...
go vet ./...
go build ./...
```

### Express — `services/express-api`

Route mounts in `src/app.js`:

| Mount | Route module | Domain |
|---|---|---|
| `/api/auth` | `routes/auth.route.js` | Account/session/profile |
| `/api/messages` | `routes/message.route.js` | User lookup, messages, read/edit/send |
| `/api/notifications` | `routes/notification.route.js` | Notification list, read state, preferences, device tokens |
| `/api/incidents` | `routes/incidents.route.js` | Incident-related facade operations |
| `/api/ai` | `routes/ai.route.js` | AI answer, document ingestion/list/search, multi-agent, execution history and metrics |
| `/internal` | `routes/internal-call-events.route.js` | Internal Nest call-event integration |

Socket.IO is configured separately and shares the Express runtime. MongoDB/Mongoose is the primary document store; Redis supports selected cross-request coordination. The auth middleware loads the account record and exposes only selected profile fields to request handlers.

Commands from repository root:

```bash
pnpm test:express-api
pnpm --dir services/express-api dev
```

### NestJS — `services/nest-api`

| Module | Responsibility | Main interface |
|---|---|---|
| `auth` | JWT strategy, HTTP/GraphQL guards, user identity context | Middleware/guards |
| `conversations` | Conversations, messages, tasks, calls, recording uploads, media authorization | GraphQL + REST |
| `jobs` | Authenticated facade to Go Jobs API | REST `/jobs` |
| `ai` | Conversation and knowledge AI integration | REST `/ai/answer` and service methods |
| `health` | Liveness/readiness | REST `/health`, `/health/ready` |
| `prisma` | PostgreSQL data client | Internal provider |

Prisma schema models conversation, message, participant, task, checklist/activity/link, call session/participant, recording, recording upload/track, transcript, summary and processing job data. MongoDB integration supports existing user accounts. Nest module/controller/resolver sources define the exact contract.

Commands from repository root:

```bash
pnpm build:nest-api
pnpm test:nest-api
pnpm test:e2e:nest-api
```

### Python AI — `services/ai-service`

| Module | Responsibility | State/integration |
|---|---|---|
| `app/rag/` | Chunking, embeddings, ingestion, retrieval and answers | PostgreSQL/pgvector, configured embedding/generation providers |
| `app/agentops/` | Incident lifecycle and conversation analysis | Tenant model, incident/evidence records, provider/tools |
| `app/multi_agent/` | Task API, coordinator, agents, providers, worker, progress | PostgreSQL, Redis, configured model adapters |
| `app/recordings/` | Recording storage access, transcription, repository, worker | PostgreSQL, object storage, audio processing dependencies |
| `app/core/` | Configuration, auth and OpenAPI helpers | Environment and internal token |
| `app/db/` | Async SQLAlchemy session and database setup | PostgreSQL |

Commands from repository root:

```bash
pnpm test:ai-service
```

The root script expects `services/ai-service/.venv/bin/python`; alternatively run pytest using the service's own configured environment.

## Worker and broker services

### Go Jobs API

The Jobs API exposes health/readiness, RabbitMQ health, worker heartbeat and authenticated internal job submission/history/detail. The route contract is in `services/jobs-api/main.go`; the service uses Gin. It is internal in the current Gateway route policy.

### Go Jobs Worker

The worker consumes `go.jobs`, uses delayed retry queues and `go.jobs.dlq`, manually acknowledges, and uses Redis for idempotency/status/heartbeat coordination. The only implemented business job type in `job.go` is `welcome`. The service has no public HTTP listener.

### Multi-agent Worker

A separate Compose command executes `python -m app.multi_agent.worker`. It claims persisted task records and executes under bounded step and timeout constraints.

### Recording Worker

A separate Dockerfile/dependency set is used for audio processing. Its configuration includes Whisper model/device/compute parameters, CPU threads, lease/heartbeat, attempt and retry settings. It is a background processing workload, not part of the call control API.

## Dependency and failure ownership

A service is responsible for translating downstream failures into its public contract. The Gateway reports proxy-level upstream failures; Express/Nest report application and dependency errors; Python maps provider/database failures to its FastAPI errors; workers update lifecycle state and broker routing. Operators should preserve this ownership when diagnosing a fault rather than treating every HTTP 5xx as a Gateway problem.
