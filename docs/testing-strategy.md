# Relay Testing Strategy

## Test layers

| Layer | Purpose | Typical implementation |
|---|---|---|
| Unit | Deterministic domain logic and transformations | Vitest, Go testing, pytest |
| Component | UI states, accessibility hooks, and interactions | React Testing Library, Vitest |
| API integration | Middleware, auth, persistence, service adapters | Node test runner, Supertest/Vitest, pytest |
| Contract | HTTP, GraphQL, Socket.IO, and AMQP compatibility | OpenAPI/schema assertions and integration tests |
| End-to-end | User-visible cross-component journeys | Playwright and service E2E suites |
| Infrastructure | Manifest composition and policy validation | Kustomize, Terraform, Trivy/security workflows |
| Performance | Latency, throughput, and resource profiles | Defined workload scripts and reports |

## Critical scenarios

- Authentication: valid, invalid, expired, and unauthorized identities.
- Authorization: cross-user and cross-tenant access denial.
- Messaging: send, history pagination, read state, realtime reconnect.
- Calls: lifecycle transitions, participant authorization, recording consent.
- Recording: upload session, completion metadata, storage errors, recovery, transcription.
- Jobs: publication confirmation, status persistence, duplicate delivery, retry, dead-letter, heartbeat, shutdown.
- RAG: tenant-scoped ingestion, embedding, retrieval, citations, empty retrieval, provider failure.
- Incident intelligence: investigation, approval, action execution, and recovery state.
- Multi-agent: task creation, worker claim, progress, result, and failure state.

## Test data and isolation

Use synthetic identities and fixtures. Keep test credentials isolated. Reset state between tests or use unique namespaces/IDs. Never use production personal data in test fixtures.

## CI interpretation

Aggregate scripts run the configured service checks. CI workflow definitions may add build, lint, dependency, secret, container, Terraform, or Kubernetes checks. A passing job proves only the checks included in that workflow and commit.

## Evidence format

Record the commit SHA, command, runtime/tool versions, environment, result, and retained report artifact. For device-specific functionality, include OS/device class, build profile, and permission configuration.
