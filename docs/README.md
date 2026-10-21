# Relay Engineering Documentation

This directory is the authoritative documentation home for architecture, engineering policy, implementation evidence, release operations, security, AI behavior, and deployment preparation.

## Core engineering references

The client guides are [Web](../apps/web/README.md) and [Mobile](../apps/mobile/README.md). Service-specific development guides live beside each service: [API gateway](../services/api-gateway/README.md), [Express API](../services/express-api/README.md), [NestJS API](../services/nest-api/README.md), [Go jobs API](../services/jobs-api/README.md), [Go jobs worker](../services/jobs-worker/README.md), and [Python AI service](../services/ai-service/README.md).

- [Repository layout and migration notes](repository-layout.md) — canonical paths, the duplicate Express decision, and refactor validation checklist.
- [Mobile architecture and security](mobile-architecture.md) — native client boundaries, bearer authentication, secure storage, realtime semantics, and mobile release gates.
- [Architecture](architecture.md) — service responsibilities, trust boundaries, runtime relationships, data ownership, and known limitations.
- [Engineering standards](engineering-standards.md) — implementation, review, security, reliability, testing, and definition-of-done requirements.
- [Code commenting standard](code-commenting-standard.md) — intent-focused comments, docstrings, and language conventions.
- [Architecture decision records](decisions/README.md) — durable decisions, trade-offs, and verification requirements.
- [Implementation status](implementation-status.md) — evidence vocabulary, repository inventory, verification ledger, and explicit non-claims.
- [Production guide](production-guide.md) — release gates, deployment strategy, rollback, observability, backup/restore, and operational acceptance.
- [Security and operations](security-and-operations.md) — focused implementation notes and operational controls.
- [Threat model](security/threat-model.md) — assets, trust boundaries, abuse cases, and release security gates.
- [Production readiness gates](production-readiness-gates.md) — evidence-based release checklist across security, correctness, reliability, and capacity.
- [SLOs and error budgets](reliability/slo-and-error-budgets.md) — proposed service indicators, failure semantics, and resilience patterns.
- [CPU and memory engineering](performance/resource-efficiency.md) — resource budgets, profiling and reproducible benchmark policy.
- [Incident response](operations/incident-response.md) — triage, mitigation and service-specific runbooks.
- [Backup and disaster recovery](operations/backup-and-disaster-recovery.md) — data classification, restore drills and RPO/RTO policy.
- [Performance test contract](../tests/performance/README.md) — workload scenarios and required benchmark evidence.

## AI and retrieval references

- [AI API reference](ai-api-reference.md) — currently documented Express-facing AI endpoints and request/response expectations.
- [AI user guide](ai-user-guide.md) — user-facing workflow notes.
- [Knowledge base](ai-knowledge-base.md) — AI/RAG concepts and repository-specific terminology.
- [RAG troubleshooting](ai-rag-troubleshooting.md) — diagnostics for common retrieval/provider failures.

## Deployment references

- [AWS architecture proposal](architecture/aws-deployment.md) — proposed deployment topology; not evidence of provisioned resources.
- [AWS deployment checklist](aws-deployment-checklist.md) — preparation gates before any AWS deployment.
- [Kubernetes AWS overlay README](../infrastructure/kubernetes/overlays/aws/README.md) — overlay-specific caveats and prerequisites.

## Documentation maintenance policy

Documentation must describe observable source and configuration, not aspirational behavior as if already delivered. Mark proposals and unverified assumptions explicitly. Every change that affects a service boundary, environment variable, API/event contract, migration, route, deployment artifact, health endpoint, or operational procedure must update the corresponding reference and verification ledger.
