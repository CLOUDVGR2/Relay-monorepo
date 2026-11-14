# Relay Request and Event Flows

This document traces the most important cross-service workflows. Exact payload contracts are defined by the route schemas and generated API specifications.

## 1. Browser navigation and API request

```mermaid
sequenceDiagram
  participant B as Browser
  participant N as NGINX
  participant G as Go Gateway
  participant E as Express or NestJS
  participant D as Domain store/dependency
  B->>N: Load SPA document/assets
  N-->>B: Static bundle
  B->>N: API or GraphQL request
  N->>G: Proxy configured path
  G->>E: Route by explicit allowlist
  E->>E: Authenticate, validate and authorize
  E->>D: Execute domain operation
  D-->>E: Result
  E-->>G: Domain response
  G-->>N: Forward response + request ID
  N-->>B: Response
```

Browser cookie/session behavior is owned by the authenticated API. The Gateway does not create a second identity system. NGINX and Gateway have separate routing scopes; consult `apps/web/nginx.conf` and `services/api-gateway/server.go` together.

## 2. Native API and realtime path

```mermaid
sequenceDiagram
  participant App as Expo app
  participant API as Shared Axios client
  participant G as Gateway
  participant E as Express
  participant S as Socket.IO
  App->>API: User action
  API->>G: HTTP request + bearer token
  G->>E: /api route
  E->>E: Verify token and load user
  E-->>App: JSON response
  App->>S: Socket.IO handshake with auth context
  S->>E: Authenticated realtime session
  E-->>App: User-room event
```

HTTP and Socket.IO are different authorization surfaces. Test handshake identity, room membership, event routing and stale-session behavior separately from REST authorization.

## 3. Knowledge ingestion and global retrieval

```mermaid
sequenceDiagram
  participant C as Client
  participant G as Gateway
  participant E as Express AI facade
  participant P as Python FastAPI
  participant DB as PostgreSQL + pgvector
  participant M as Embedding / generation provider
  C->>G: POST /api/ai/documents (authenticated)
  G->>E: Forward
  E->>P: POST /v1/documents + internal bearer + Relay ID
  P->>DB: Resolve uploader tenant and persist document/chunks
  P->>M: Embed chunks
  M-->>P: Vectors
  P->>DB: Persist embeddings/search vectors
  P-->>E: Document status
  E-->>C: Upload result
  C->>G: POST /api/ai/answer
  G->>E: Forward
  E->>P: POST /v1/documents/answer + identity context
  P->>DB: Vector + full-text retrieval across indexed tenants
  P->>M: Generate answer when deterministic rule does not apply
  M-->>P: JSON answer and candidate citations
  P->>DB: Validate citation IDs against retrieved chunks
  P-->>E: Answer and citations with uploader identity
  E->>E: Resolve uploader IDs to display names
  E-->>C: Answer, uploader names and citations
```

**Access rule:** uploads, per-user document listing and direct document-by-ID retrieval are tenant-scoped. Search and answer currently retrieve across tenant IDs. This supports shared knowledge discovery but is not a per-document sharing ACL. The current code has no visibility/group permission filter at retrieval time. Do not use a global corpus for data that must remain isolated until an explicit ACL is implemented and tested.

## 4. Call and recording workflow

```mermaid
sequenceDiagram
  participant App as Mobile client
  participant Nest as NestJS
  participant Store as S3-compatible storage
  participant Worker as Python recording worker
  participant DB as PostgreSQL
  participant AI as Python AI API
  App->>Nest: Create/accept/end call
  Nest->>DB: Persist call/participant state
  App->>Nest: Request recording authorization/upload session
  Nest->>DB: Validate consent/session and create upload state
  Nest-->>App: Upload details
  App->>Store: Upload audio object
  App->>Nest: Complete upload with metadata
  Nest->>Store: Verify object metadata/existence
  Nest->>DB: Persist completion/processing state
  Worker->>DB: Claim processing work
  Worker->>Store: Retrieve object
  Worker->>AI: Transcription/analysis request as configured
  Worker->>DB: Persist transcript/summary/job outcome
```

The exact upload sequence depends on the configured storage integration. Call ended, upload complete, object verified, transcript complete and summary complete are separate lifecycle milestones. Recovery and retry need to be tested across app restarts and worker restarts.

## 5. Go job workflow

```mermaid
sequenceDiagram
  participant Caller as NestJS / internal caller
  participant API as Go Jobs API
  participant MQ as RabbitMQ
  participant Worker as Go Jobs Worker
  participant Redis as Redis
  Caller->>API: Authenticated job submission
  API->>MQ: Publish job message
  API->>Redis: Store or update status coordination
  Worker->>MQ: Consume manual-ack delivery
  Worker->>Redis: Acquire idempotency/status coordination
  Worker->>Worker: Validate and execute supported job type
  alt Success
    Worker->>Redis: Mark completed
    Worker->>MQ: Acknowledge delivery
  else Retryable failure
    Worker->>MQ: Publish delayed retry with attempt metadata
    Worker->>Redis: Mark retrying
    Worker->>MQ: Acknowledge original after publish succeeds
  else Invalid/exhausted
    Worker->>MQ: Publish dead-letter message
    Worker->>Redis: Mark failed
    Worker->>MQ: Acknowledge original after publish succeeds
  end
```

At-least-once delivery requires idempotency. Verify that retry or DLQ publication succeeded before acknowledging the original delivery. The worker's currently supported job type is `welcome`.

## 6. Multi-agent task lifecycle

```mermaid
sequenceDiagram
  participant Client
  participant API as Python multi-agent API
  participant DB as PostgreSQL
  participant Redis
  participant Worker as Multi-agent worker
  Client->>API: Create bounded task
  API->>DB: Persist queued task
  API-->>Client: Task ID and state
  Worker->>DB: Discover/claim task
  Worker->>Redis: Acquire lease/fencing context
  Worker->>Worker: Execute coordinator and agent steps
  Worker->>DB: Persist progress/result/error
  Worker->>Redis: Renew/release coordination
  Client->>API: Get task status
  API->>DB: Read owner/tenant-scoped record
  API-->>Client: Public task state
```

Task prompt, steps and timeout are bounded by the request contract. Internal worker lease information is not intended to be exposed in ordinary task responses.

## 7. Health and observability flows

- Gateway `/healthz` reports process liveness.
- Gateway `/readyz` probes Express and Nest readiness.
- Express readiness includes MongoDB connection state; a separate Redis probe exists.
- Nest exposes `/health` and `/health/ready`.
- Python exposes `/healthz` and `/readyz`; readiness checks service dependencies as implemented.
- Go Jobs API exposes liveness/readiness and worker heartbeat-related paths.
- Prometheus scrapes HTTP metrics and configured blackbox targets; workers publish heartbeat/state signals for API observation.

A healthy process probe must not be interpreted as proof that every user journey, provider call, queue, storage operation or worker is healthy.
