# Relay Technical Documentation

This documentation set describes the platform as an engineering system: product capabilities, runtime architecture, API contracts, data boundaries, security controls, delivery topology, and operational practices.

## Portfolio and product experience

- [Engineering portfolio case study](engineering-portfolio.md) — hiring-manager overview of technical scope and engineering disciplines.
- [Product and experience architecture](product-experience.md) — information architecture, design system, accessibility, and interaction model.
- [Data architecture](data-architecture.md) — persistence ownership, tenant boundaries, and cross-store workflows.
- [Observability architecture](observability.md) — logs, metrics, health semantics, and operational signals.
- [Testing strategy](testing-strategy.md) — unit, integration, contract, E2E, infrastructure, and performance coverage.

## Architecture and platform design

- [System architecture](architecture.md) — service topology, runtime responsibilities, request paths, asynchronous processing, and data boundaries.
- [Platform capabilities](platform-capabilities.md) — implementation inventory organized by product domain.
- [Repository layout](repository-layout.md) — canonical source map and workspace boundaries.
- [Architecture decision records](decisions/README.md) — recorded architectural choices.

## Client applications

- [Web application](../apps/web/README.md) — React application structure, state, routing, and UI system.
- [Mobile architecture](mobile-architecture.md) — Expo runtime, authenticated networking, realtime transport, calls, and local data.
- [Mobile implementation guide](../apps/mobile/README.md) — configuration, build, and verification.

## APIs and AI

- [API and AI reference](ai-api-reference.md) — public gateway routes and AI service contracts.
- [AI knowledge architecture](ai-knowledge-base.md) — ingestion, embeddings, retrieval, tenant context, and grounded generation.
- [AI user guide](ai-user-guide.md) — user-facing interaction patterns and citation semantics.
- [Python AI service](../services/ai-service/README.md) — FastAPI modules and execution models.
- [Express API](../services/express-api/README.md) — authentication, messaging, notifications, and Socket.IO.
- [NestJS API](../services/nest-api/README.md) — GraphQL, REST, calls, tasks, and recording workflows.
- [Go API gateway](../services/api-gateway/README.md) — reverse-proxy routing and request policy.
- [Jobs API](../services/jobs-api/README.md) and [Jobs worker](../services/jobs-worker/README.md) — queue contracts and asynchronous processing.

## Security, reliability, and operations

- [Threat model](security/threat-model.md)
- [Security and operations](security-and-operations.md)
- [Reliability objectives](reliability/slo-and-error-budgets.md)
- [Performance engineering](performance/resource-efficiency.md)
- [Backup and recovery](operations/backup-and-disaster-recovery.md)
- [Incident operations](operations/incident-response.md)
- [Release engineering](production-guide.md)
- [Release acceptance gates](production-readiness-gates.md)

## Infrastructure and delivery

- [AWS deployment architecture](architecture/aws-deployment.md)
- [AWS deployment checklist](aws-deployment-checklist.md)
- [Kubernetes AWS overlay](../infrastructure/kubernetes/overlays/aws/README.md)
- [External Secrets Operator integration](../infrastructure/kubernetes/infra/external-secrets/README.md)

## Engineering standards

- [Engineering standards](engineering-standards.md)
- [Code commenting standard](code-commenting-standard.md)
- [Performance test contract](../tests/performance/README.md)
- [Contributing handbook](../CONTRIBUTING.md)
