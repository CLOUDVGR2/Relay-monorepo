# Relay Technical Documentation

This documentation set is the engineering reference for the Relay monorepo. It is written for engineers building and operating the platform, architecture and security reviewers, engineering leaders, hiring managers, and technical recruiters.

## Start here

| Reader | Recommended path |
|---|---|
| Executive / engineering leader | [Enterprise Technical Dossier](enterprise-technical-dossier.md) → [Architecture](architecture.md) → [Engineering Portfolio](engineering-portfolio.md) → [Production Readiness](production-readiness-gates.md) |
| Staff/principal engineer | [Architecture](architecture.md) → [Service Catalog](architecture/service-catalog.md) → [Data Architecture](data-architecture.md) → [Security Threat Model](security/threat-model.md) → [Reliability](reliability/slo-and-error-budgets.md) |
| Backend engineer | [API Reference](ai-api-reference.md) → service README → [Data Architecture](data-architecture.md) → [Testing Strategy](testing-strategy.md) |
| AI / ML engineer | [AI Knowledge Base](ai-knowledge-base.md) → [AI API Reference](ai-api-reference.md) → [AI Platform Operations](ai-platform-operations.md) → [AI User Guide](ai-user-guide.md) |
| Mobile engineer | [Mobile Architecture](mobile-architecture.md) → [`apps/mobile/README.md`](../apps/mobile/README.md) → [Product Experience](product-experience.md) |
| Platform / SRE engineer | [Production Guide](production-guide.md) → [Observability](observability.md) → [Incident Response](operations/incident-response.md) → [Backup and DR](operations/backup-and-disaster-recovery.md) |
| Security reviewer | [Threat Model](security/threat-model.md) → [Security and Operations](security-and-operations.md) → [`SECURITY.md`](../SECURITY.md) |
| Technical recruiter | [Engineering Portfolio](engineering-portfolio.md) → [Platform Capabilities](platform-capabilities.md) → [Repository Layout](repository-layout.md) |

## Architecture and design

- [Enterprise Technical Dossier](enterprise-technical-dossier.md) — integrated platform, evidence boundaries, due-diligence checklist, and interview guide.
- [System Architecture](architecture.md) — context, containers, ingress, trust boundaries, request flows, and design trade-offs.
- [Service Catalog](architecture/service-catalog.md) — service-by-service ownership and operational interface.
- [Request and Event Flows](architecture/request-flows.md) — detailed sequence diagrams for web/mobile, AI, calls/recordings, jobs, and workers.
- [Data Architecture](data-architecture.md) — persistence ownership, relational constraints, tenant context, and cross-store consistency.
- [Repository Layout](repository-layout.md) — source tree, build-system boundaries, and ownership map.
- [Architecture Decision Records](decisions/README.md) — accepted historical decisions and how to add new records.

## Product and engineering portfolio

- [Platform Capabilities](platform-capabilities.md) — capability/evidence matrix with implementation and maturity boundaries.
- [Product Experience](product-experience.md) — web/mobile information architecture, interaction patterns, and accessibility expectations.
- [Mobile Architecture](mobile-architecture.md) — native networking, realtime, calls, recording and local state.
- [Engineering Portfolio](engineering-portfolio.md) — evidence-led case study for hiring managers and recruiters.
- [Technical Due Diligence](governance/technical-due-diligence.md) — reviewer checklist and evidence request set.

## APIs and AI

- [API and AI Reference](ai-api-reference.md) — route ownership and public/internal distinction.
- [AI Knowledge Base](ai-knowledge-base.md) — ingestion, embeddings, hybrid retrieval, answers, tenant boundaries and quality safeguards.
- [AI Platform Operations](ai-platform-operations.md) — provider configuration, workers, diagnostics, and failure isolation.
- [AI User Guide](ai-user-guide.md) — behavior and responsible-use guidance.

## Security, reliability and operations

- [Engineering Standards](engineering-standards.md)
- [Code Commenting Standard](code-commenting-standard.md)
- [Security and Operations](security-and-operations.md)
- [Threat Model](security/threat-model.md)
- [Observability](observability.md)
- [SLO and Error Budgets](reliability/slo-and-error-budgets.md)
- [Incident Response](operations/incident-response.md)
- [Backup and Disaster Recovery](operations/backup-and-disaster-recovery.md)
- [Performance and Resource Efficiency](performance/resource-efficiency.md)
- [Testing Strategy](testing-strategy.md)

## Delivery and deployment

- [Production Guide](production-guide.md)
- [Production Readiness Gates](production-readiness-gates.md)
- [AWS Deployment Architecture](architecture/aws-deployment.md)
- [AWS Deployment Checklist](aws-deployment-checklist.md)
- [External Secrets Operator Integration](../infrastructure/kubernetes/infra/external-secrets/README.md)
- [AWS Kubernetes Overlay](../infrastructure/kubernetes/overlays/aws/README.md)

## Service documentation

| Service/client | Reference |
|---|---|
| Web | [`apps/web/README.md`](../apps/web/README.md) |
| Mobile | [`apps/mobile/README.md`](../apps/mobile/README.md) |
| Go API Gateway | [`services/api-gateway/README.md`](../services/api-gateway/README.md) |
| Express API | [`services/express-api/README.md`](../services/express-api/README.md) |
| NestJS API | [`services/nest-api/README.md`](../services/nest-api/README.md) |
| Go Jobs API | [`services/jobs-api/README.md`](../services/jobs-api/README.md) |
| Go Jobs Worker | [`services/jobs-worker/README.md`](../services/jobs-worker/README.md) |
| Python AI Service | [`services/ai-service/README.md`](../services/ai-service/README.md) |
| Performance test contract | [`tests/performance/README.md`](../tests/performance/README.md) |

## Documentation governance

The source tree, route registrations, data models, environment validation, Dockerfiles, Compose configuration, Kubernetes manifests, and generated API schemas are authoritative. Documentation may explain intent and integration, but must not silently override executable behavior.

Every material claim should be classed as one of:

- **Source-confirmed:** directly visible in implementation or configuration.
- **Test-confirmed:** exercised by a named automated test.
- **Deployment-described:** represented in infrastructure assets.
- **Environment-verified:** observed in a named target environment and release.
- **Proposed:** a recommendation that has not yet been implemented.

Numerical SLOs, capacity claims, certification statements, and production deployment claims require dated supporting evidence. Do not copy example values into external collateral as measured outcomes.
