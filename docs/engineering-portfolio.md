# Relay — Engineering Portfolio Case Study

## Executive summary

Relay is a full-stack, polyglot collaboration and operational intelligence platform. It combines browser and native mobile applications, realtime messaging, REST and GraphQL APIs, asynchronous job processing, tenant-aware retrieval-augmented generation, multi-agent execution, call-recording workflows, and Kubernetes/AWS infrastructure definitions.

The project demonstrates end-to-end engineering across product experience, API design, distributed execution, persistence, AI orchestration, security boundaries, observability, and software delivery.

## Engineering scope

### Full-stack product engineering
- React 19 browser application with routed product and operational workspaces.
- Expo / React Native client with native authentication, realtime connectivity, task workflows, calls, and recording support.
- Shared interaction patterns, reusable UI primitives, responsive layout, and accessibility foundations.

### Distributed backend architecture
- Go API gateway with explicit route registration, reverse proxy transports, request correlation, trusted proxy handling, and gateway health semantics.
- Express API with HTTP and Socket.IO, JWT-based identity, MongoDB persistence, Redis integration, and service adapters.
- NestJS API with GraphQL resolvers, REST controllers, authenticated guards, DTO validation, Prisma/Mongoose integrations, and domain services.
- Go jobs API and worker using RabbitMQ and Redis for asynchronous delivery, status, idempotency, retries, and worker heartbeat.
- Python FastAPI service for RAG, incident intelligence, conversation analysis, multi-agent workflows, and recording processing.

### AI and data engineering
- Tenant-aware document ingestion and semantic retrieval using PostgreSQL and pgvector.
- Embedding and model-provider abstraction through dedicated service modules.
- Evidence-bearing answers with source citations.
- Structured incident investigation with explicit approval and execution phases.
- Durable multi-agent task state and progress reporting.
- Recording transcription and downstream analysis as asynchronous processing.

### Platform and cloud engineering
- Dockerfiles and Compose topology for local multi-service execution.
- Kubernetes Kustomize base and local/AWS overlays.
- Terraform definitions for ECR, S3 recording storage, IAM roles/policies, and EKS Pod Identity associations.
- External Secrets Operator integration with AWS Secrets Manager.
- GitHub Actions and Jenkins assets for build, validation, and security workflows.
- Prometheus, Grafana provisioning, Blackbox Exporter, and cAdvisor configuration.

## Architectural decisions with engineering significance

| Decision | Engineering value |
|---|---|
| Service boundaries by domain and runtime | Independent ownership and language-appropriate toolchains |
| Explicit gateway route allowlist | Controlled public surface and separation of edge routing from domain contracts |
| Separate Express and NestJS APIs | Distinct realtime/collaboration and GraphQL/domain responsibilities |
| RabbitMQ worker architecture | Decoupled execution, manual acknowledgement, retries, dead-letter routing |
| Redis-backed idempotency/status | Coordination across worker restarts and duplicate deliveries |
| Tenant-scoped RAG | Data isolation applied before retrieved content enters model context |
| Separate recording worker | Media processing isolated from interactive call lifecycle |
| Kustomize overlays and Terraform | Declarative environment composition and infrastructure definition |

## Engineering disciplines represented

- TypeScript and JavaScript application architecture.
- Go HTTP services and concurrent worker lifecycle management.
- Python async APIs, persistence, and model orchestration.
- REST, GraphQL, Socket.IO, and AMQP contracts.
- MongoDB, PostgreSQL, pgvector, Redis, and RabbitMQ integration.
- JWT, internal bearer authentication, tenant scoping, and secret management.
- Docker, Kubernetes, Terraform, CI/CD, and observability.
- Unit, integration, E2E, security, and performance test design.

## Audience-specific reading paths

**Hiring managers:** Start with this case study, then review [Platform Capabilities](platform-capabilities.md), [System Architecture](architecture.md), and the [Repository Map](repository-layout.md).

**Staff/principal engineers and architects:** Review [System Architecture](architecture.md), [Threat Model](security/threat-model.md), [Reliability Objectives](reliability/slo-and-error-budgets.md), [Data Architecture](data-architecture.md), and the ADR index.

**Backend and platform engineers:** Review the service READMEs, [API Reference](ai-api-reference.md), [Release Engineering](production-guide.md), and Kubernetes/AWS deployment documents.

**Product designers and frontend engineers:** Review [Product Experience Architecture](product-experience.md), the web application README, and the mobile architecture.

## Evidence discipline

The repository documents implementation structure and executable contracts. Performance, availability, security certification, production scale, and deployment outcomes should be represented with measured evidence from the target environment. This case study intentionally makes no unsupported traffic, latency, uptime, or revenue claims.
