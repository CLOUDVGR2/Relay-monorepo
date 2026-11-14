# Relay Platform Capabilities and Evidence Matrix

This matrix is intended for technical buyers, hiring teams and architecture reviewers. It separates what the source implements from deployment assets and claims that would require operational proof.

## 1. Product capability matrix

| Capability | Implementation evidence | Current boundary / qualification |
|---|---|---|
| Account and session workflows | Express auth routes, Mongoose User model, Nest auth guards | Verify session revocation, token lifecycle and production identity policy for the target environment |
| Messaging and realtime | Express message routes and Socket.IO; Nest conversation/message GraphQL domain | HTTP and realtime authorization must be tested separately |
| Notifications | Express notification controllers/routes; device token support | Push provider credentials and platform delivery must be configured per environment |
| Calls | Nest call resolver/service, participant/session state, mobile call media hook | Device/network/permission behavior requires physical-device verification |
| Recording | Consent authorization, upload lifecycle, storage adapter, Python recording worker | End-to-end object durability and processing need deployment-specific verification |
| Tasks | Nest GraphQL task domain, checklist items, activity and links | Schema and operation access rules remain authoritative in Nest source |
| Jobs | Nest facade, Go Jobs API, RabbitMQ, Go worker, Redis coordination | Current worker's business job handler supports `welcome`; do not claim a broad production job catalog |
| Knowledge ingestion | Express facade to Python document API, SQLAlchemy document/chunk models | Upload/list/direct get are owner-tenant scoped |
| Shared Knowledge Base answer | Hybrid retrieval in Python, citation validation, Express uploader-name resolution | Current search/answer span tenant IDs; no per-document ACL or visibility groups in retrieval code |
| Conversation analysis | Nest integration to Python `/v1/conversations/analyze` | Bounded transcript and structured output; generated action items need human confirmation |
| Incident intelligence | Python incident lifecycle and evidence models | Supported scenario is currently `api-latency-spike-v1`; creating an incident does not execute remediation |
| Multi-agent execution | Python task API/coordinator/providers/worker and persistent task state | Provider setup and runtime capacity are environment-dependent; asynchronous completion must be polled |
| Observability | Metrics middleware, Prometheus configuration, blackbox probes, Grafana provisioning, cAdvisor | A configured scrape target is not proof of deployed alerting or on-call operations |
| Cloud deployment | Kustomize overlays and AWS Terraform | Templates contain environment-specific prerequisites/placeholders; no live environment is asserted |

## 2. Engineering disciplines represented

| Discipline | Repository evidence | What a reviewer can inspect |
|---|---|---|
| Full-stack product engineering | React pages, components, Zustand stores, Vite build | Routing, component state, loading/error behavior, responsive experience, component tests |
| Native mobile engineering | Expo/React Native, TypeScript, navigation, realtime, media, storage helpers | API integration, platform permissions, call/recording lifecycle, local recovery, typecheck |
| Backend API design | Express REST, Nest REST/GraphQL, FastAPI, Go HTTP | Contract ownership, validation, error mapping, authentication and service adapters |
| Distributed systems | RabbitMQ jobs, Redis coordination, persistent worker tasks, service-to-service auth | Retry order, idempotency, lease/heartbeat semantics, timeouts and failure handling |
| Data engineering | MongoDB, PostgreSQL, pgvector, object storage, Alembic/Prisma migrations | Model boundaries, indexing, referential integrity and migration strategy |
| AI/ML application engineering | Embedding/generation providers, hybrid retrieval, citation validation, transcript analysis, agents | Provider abstraction, schema validation, bounded inputs and answer-quality evaluation |
| Security engineering | JWT/cookie/bearer auth, internal token boundaries, CORS, Helmet, secret integration | Threat model, ownership tests, credential boundary and configuration validation |
| Platform engineering | Dockerfiles, Compose, Kustomize, Terraform, CI workflows | Reproducible builds, manifests, release controls and infrastructure validation |
| SRE/operations | Health/readiness, metrics, retry/DLQ, worker heartbeats, runbooks | Operational signals, incident diagnosis, recovery and readiness design |

## 3. Capability maturity vocabulary

Use one of these states when presenting a capability:

- **Implemented:** a corresponding implementation exists in source.
- **Tested:** a named test suite exercises the behavior.
- **Containerized:** a Dockerfile/Compose workload exists.
- **Deployment-described:** deployment manifests or infrastructure code exist.
- **Environment-verified:** a particular environment has been smoke-tested and its result is retained.
- **Production-operated:** actual traffic, on-call, incident, SLO and recovery evidence is available.

A feature can occupy multiple states. Source presence alone never implies production operation.

## 4. Cross-cutting engineering characteristics

### Contract boundaries

Gateway routing, Express and Nest API ownership, Python internal routes, GraphQL resolvers, Go job contracts, and worker messages have distinct owners. Avoid changing a service contract without tracing all producers and consumers.

### Data protection

The system carries user identities across MongoDB and PostgreSQL service boundaries. Internal service credentials are separate from Relay user context. The shared Knowledge Base is a notable exception to per-user retrieval isolation and should be treated as broadly visible among authenticated users.

### Resilience

Retry, idempotency, leases, dead-letter queues, timeouts and heartbeat patterns exist in selected services. Their behavior and operating thresholds must be verified per workflow; they do not imply a platform-wide reliability guarantee.

## 5. Evidence for external reviewers

A defensible engineering portfolio should provide:

1. A commit SHA and repository snapshot.
2. The route/service ownership map.
3. Representative tests and their exact command output.
4. Build and dependency-lock evidence.
5. Architecture and threat-model review notes.
6. A rendered Kustomize/Terraform validation report.
7. For production claims, deployment IDs, image digests, measured traffic/latency, SLO reports, security assessment, backup restore evidence and incident records.

Do not publish customer data, credentials, unreviewed architecture diagrams or invented operational metrics as portfolio evidence.
