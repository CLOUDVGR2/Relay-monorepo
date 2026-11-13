# Relay Platform Overview

## Platform purpose

Relay is a collaboration and operational intelligence platform with browser and native clients. It combines synchronous user-facing workflows—identity, conversations, calls, tasks, and notifications—with asynchronous capabilities for job execution, AI analysis, document retrieval, and media processing.

The platform is implemented as a service-oriented monorepo. Each runtime has a distinct responsibility and technology boundary, while shared deployment configuration describes how the services are assembled.

## Product domains

### Collaboration workspace
- Account registration, login, session-aware navigation, and profile management.
- User discovery and conversation creation.
- Message composition, history, read state, and real-time delivery through Socket.IO.
- Notification preferences, device tokens, and activity inbox workflows.

### Calls and recording
- Call session creation, acceptance, decline, termination, and history.
- Consent-aware media-session authorization.
- Native audio capture and recording recovery.
- Upload-session creation, completion, and refresh through the NestJS API.
- Object storage integration and asynchronous recording transcription/analysis.

### Tasks and asynchronous work
- User-owned tasks, checklist items, and links through GraphQL operations.
- Jobs API for validated job submission and owner-scoped status retrieval.
- RabbitMQ-backed worker execution with Redis status, idempotency, retry, and heartbeat coordination.

### AI and operational intelligence
- Conversation transcript analysis with structured output.
- Incident creation, investigation, approval, execution, and recovery workflows.
- Document ingestion, chunking, embedding, semantic search, and grounded answer generation.
- Durable multi-agent task submission and progress/result retrieval.

## Runtime composition

| Runtime | Role | Primary interface |
|---|---|---|
| React web | Browser application and operational workspace | HTTP APIs, GraphQL, Socket.IO |
| Expo mobile | Native Android/iOS companion | Express HTTP API, Socket.IO, NestJS GraphQL/REST |
| Go API Gateway | Public HTTP reverse proxy and route policy | HTTP |
| Express API | Identity, messaging, notifications, incident and AI integration routes | REST, Socket.IO |
| NestJS API | Conversation, call, task, job, and recording domain operations | GraphQL, REST |
| Go Jobs API | Job submission, status, and worker health | REST |
| Go Jobs Worker | Asynchronous queue consumer | RabbitMQ, Redis |
| Python AI service | AI orchestration, RAG, incident intelligence, multi-agent execution | FastAPI |
| Recording worker | Recording retrieval, transcription, and analysis | PostgreSQL, object storage, AI API |

## Data and infrastructure

- MongoDB stores Express-oriented user, message, and notification documents.
- PostgreSQL stores relational domain and AI records, including tenant-scoped documents, chunks, incidents, and multi-agent task data.
- pgvector supports semantic vector retrieval.
- Redis supports selected cache, rate-limit, coordination, task status, idempotency, and heartbeat use cases.
- RabbitMQ provides durable asynchronous job transport.
- RustFS provides S3-compatible object storage in local Compose/Kubernetes environments; AWS deployment assets describe S3 integration.
- Prometheus, Blackbox Exporter, and Grafana provide metrics collection, probing, and visualization configuration.

## Architectural model

Relay separates user-facing API contracts from internal execution services. Public traffic enters through the gateway route allowlist. Domain services enforce authentication, authorization, validation, and persistence semantics. Workers consume bounded asynchronous workloads and communicate through explicit broker or database contracts. AI operations are isolated behind the Python service and internal authentication.

See [System Architecture](docs/architecture.md) for service interactions and [Platform Capabilities](docs/platform-capabilities.md) for the implementation inventory.
