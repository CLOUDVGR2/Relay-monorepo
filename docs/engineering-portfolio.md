# Relay — Engineering Portfolio and Technical Case Study

**Purpose:** evidence-led overview for hiring managers, engineering leaders, technical interviewers and technical recruiters.
**Positioning:** a source-backed demonstration of cross-stack software engineering, distributed service design, AI application engineering and platform delivery.

## 1. Executive summary

Relay is a collaborative operations platform implemented as a polyglot monorepo. It combines a React browser client, Expo/React Native application, Go API gateway and job services, Express and NestJS APIs, a Python AI service, dedicated background workers, multiple data stores, object storage, infrastructure-as-code assets and observability configuration.

The engineering value is in the integration and ownership boundaries: user-facing collaboration, GraphQL domain operations, realtime transport, asynchronous jobs, media processing and AI retrieval are implemented as distinct workflows with explicit contracts and persistence responsibilities.

Relay should be presented as an implemented engineering portfolio and deployment-preparation codebase. Do not represent it as a globally operated SaaS, a measured high-scale service, or a certified regulated system without separate deployment and assurance evidence.

## 2. Architecture footprint

| Layer | Technologies evidenced in source | Engineering problem represented |
|---|---|---|
| Web | React 19, Vite, React Router, Zustand, Tailwind/DaisyUI, Vitest, Playwright | Browser UX, state, design tokens, testable component composition |
| Mobile | Expo SDK 57, React Native 0.86, TypeScript, navigation, secure/local storage, media libraries | Cross-platform client, authenticated networking, realtime, calls and recovery |
| Gateway | Go `net/http`, reverse proxy, request IDs, trusted-proxy parsing, Prometheus | Public route allowlisting, upstream isolation, WebSocket forwarding and request telemetry |
| Express API | Node.js, Express, Socket.IO, Mongoose, Redis | Identity/session, messaging, notifications, realtime and AI facade |
| NestJS API | NestJS, GraphQL/Apollo, REST, Prisma, Mongoose, Redis | Conversation/task/call domain, jobs and recording workflows |
| Jobs | Go/Gin, RabbitMQ, Redis | Asynchronous submission, retries, DLQ, idempotency and worker health |
| AI | Python/FastAPI, SQLAlchemy, Alembic, PostgreSQL/pgvector, LiteLLM, Ollama, LangGraph, MCP | RAG, structured generation, incident workflows and multi-agent execution |
| Infrastructure | Docker/Compose, Kustomize, Terraform, GitHub Actions, Jenkinsfile | Reproducible container builds, environment composition and validation |
| Observability | Prometheus, Blackbox Exporter, Grafana, cAdvisor, service metrics | Health probing, service metrics and container resource visibility |

## 3. Engineering work represented

### Full-stack and product engineering

- Browser application with authentication, collaboration, AI and operational workspaces.
- Mobile application with dedicated API, GraphQL and realtime clients.
- Shared presentation tokens and reusable UI components.
- Explicit loading, error, empty and asynchronous result patterns.

**Review paths:** `apps/web/src/`, `apps/mobile/src/`, `docs/product-experience.md`.

### Backend and API engineering

- Route ownership split across Express REST/Socket.IO and NestJS GraphQL/REST.
- Go Gateway allowlist rather than unrestricted internal-service exposure.
- Pydantic/Nest DTO input validation and service integration adapters.
- Authenticated internal HTTP calls with separate service token and Relay identity context.

**Review paths:** `services/api-gateway/`, `services/express-api/src/`, `services/nest-api/src/`, `services/ai-service/app/`.

### Distributed systems and reliability engineering

- RabbitMQ publisher/consumer boundary.
- Manual acknowledgement and retry/dead-letter handling.
- Redis idempotency/status/heartbeat coordination.
- Persisted multi-agent tasks, worker claims/leases and progress.
- Recording workflow separated into upload and asynchronous processing.

**Review paths:** `services/jobs-api/`, `services/jobs-worker/`, `services/ai-service/app/multi_agent/`, `services/ai-service/app/recordings/`.

### AI and data engineering

- Document ingestion, chunking, embedding and vector persistence.
- Hybrid vector and PostgreSQL full-text retrieval with rank fusion.
- Citation ID validation and abstention path.
- Independent embedding and generation provider selection.
- Deterministic guardrail for weekday operating-hours questions.
- Tenant-associated incident and multi-agent data models.

**Review paths:** `services/ai-service/app/rag/`, `app/agentops/`, `app/multi_agent/`, `app/models/`, `migrations/versions/`.

### Platform and cloud engineering

- Per-service Dockerfiles and integrated Compose stack.
- Kubernetes Kustomize base and local/AWS overlays.
- Terraform definitions for selected AWS network, EKS, ECR, IAM and storage resources.
- CI workflows for web, Go worker, Kubernetes validation, Terraform and security/supply chain.
- Prometheus scrape, blackbox probe, Grafana and container metrics configuration.

**Review paths:** `compose.yaml`, `infrastructure/`, `.github/workflows/`, `monitoring/`.

## 4. Architectural decisions with engineering significance

| Decision | Rationale and trade-off | Discussion prompt |
|---|---|---|
| Polyglot runtimes | Use Go for gateway/jobs, TypeScript for user/domain APIs, Python for AI/worker workflows | What team ownership and operational discipline make this complexity worthwhile? |
| Two domain API layers | Express owns collaboration-oriented REST/realtime; NestJS owns GraphQL conversation/task/call domain | How do you prevent duplicated contracts and inconsistent auth? |
| Dedicated workers | Long-running job, recording and multi-agent work does not occupy user API request handlers | How are retries, leases, idempotency and backpressure measured? |
| Multi-store persistence | Match stores to document, relational, vector, ephemeral, queue and object workloads | How are consistency, retention and restore coordinated across stores? |
| Hybrid RAG | Combine semantic similarity with lexical matching and citation validation | How would relevance, grounding, access controls and model drift be measured? |
| Shared Knowledge Base discovery | Search/answer can retrieve across uploader tenants; attribution preserves source owner | Is this visibility appropriate for enterprise data, and how should ACLs evolve? |

## 5. Evidence matrix for interview use

| Competency | Evidence artifact | Suggested live walkthrough |
|---|---|---|
| System design | `docs/architecture.md`, `docs/enterprise-technical-dossier.md` | Trace a browser/mobile request through edge and service ownership |
| API design | Express route schemas, Nest DTO/controllers/resolvers, FastAPI Pydantic schemas | Compare public and internal route contracts |
| Security | `services/express-api/src/middleware/auth.middleware.js`, Nest guards, Python `core/security.py`, Gateway trusted-proxy tests | Explain user authentication vs internal service authentication |
| Data modeling | Prisma schema, SQLAlchemy models and Alembic migrations | Explain composite document/chunk tenant integrity and shared retrieval policy |
| Distributed processing | Go worker retry/DLQ/idempotency tests | Walk through acknowledgement order and redelivery |
| AI engineering | RAG retrieval/answering tests and provider interfaces | Explain evidence selection, citation validation and model failure handling |
| Mobile engineering | Media hook, recorder, upload and recovery libraries | Walk through an interrupted recording upload on-device |
| DevOps | Dockerfiles, Compose, Kustomize, Terraform, workflows | Explain what validation proves and what a deployment still requires |
| Operations | Health endpoints, metrics, incident runbooks | Identify the difference between liveness, readiness and workflow health |

## 6. Role alignment for hiring teams

The repository provides evidence relevant to several role families. It does not prove a candidate's seniority, independent ownership or years of experience; those require a technical interview and work-history verification.

| Role family | Relevant evidence | Interview emphasis |
|---|---|---|
| Senior/Staff Full-Stack Engineer | React/Expo, Express/Nest, API contracts, product workflows | End-to-end product delivery, trade-offs, UX/API boundaries |
| Backend/Distributed Systems Engineer | Go Gateway/Jobs, RabbitMQ, Redis, Express/Nest, Postgres | Failure semantics, throughput, data consistency, auth |
| AI Application / RAG Engineer | FastAPI, pgvector, embeddings, generation, citation validation, evaluation tests | Retrieval quality, model governance, grounding, access controls |
| Mobile Engineer | Expo/React Native, realtime, calls, local cache and recording recovery | Native runtime behavior, device testing, offline/retry and security |
| Platform / Cloud Engineer | Docker, Compose, Kustomize, Terraform, CI/CD workflows | Immutable artifacts, workload security, environment promotion |
| SRE / Reliability Engineer | Health semantics, metrics, worker heartbeats, retries, runbooks | SLO definition, incident response, recovery evidence and capacity |
| Security-minded Backend Engineer | JWT/cookie/bearer, internal tokens, tenant filters, CORS, proxy trust | Threat modeling, authorization consistency, privacy-by-design |

## 7. Interview presentation sequence

A 45–60 minute technical walkthrough can use this sequence:

1. **Product and problem (5 minutes):** explain collaboration and operations workflows.
2. **Context and service boundaries (10 minutes):** draw the Gateway, Express, Nest, Python, Go workers and persistence.
3. **One interactive flow (10 minutes):** trace a mobile message/call or browser AI question.
4. **One asynchronous flow (10 minutes):** trace recording or Go job state transitions.
5. **Security and data (10 minutes):** explain identity, internal tokens, tenant and shared corpus behavior.
6. **Operations and trade-offs (10 minutes):** show tests, health, metrics, manifests, gaps and next design improvement.

Strong candidates state limitations as clearly as capabilities. A reviewer should be able to verify every claim through a route, model, test, manifest or release record.

## 8. External presentation guardrails

Do not claim without independent proof:

- a specific number of users, tenants, requests per second, regions or production customers;
- 99.9%/99.99% uptime, measured latency, RTO or RPO;
- SOC 2, ISO, HIPAA, PCI or other certification;
- production autoscaling, multi-region DR or zero-downtime deploys;
- general-purpose autonomous remediation or unrestricted multi-agent capabilities;
- enterprise-safe private Knowledge Base isolation in the current shared retrieval mode.

Recommended wording: “The repository implements…”, “The codebase includes…”, “The infrastructure assets define…”, “The test suite covers…”. Use “operates in production…” only when supported by release and runtime evidence.
