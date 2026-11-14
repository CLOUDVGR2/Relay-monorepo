# Relay Engineering Contribution Guide

This guide defines the contribution workflow for a polyglot monorepo. The goal is to keep service ownership explicit while allowing cross-service changes to be reviewed as one coherent system change.

## 1. Repository model

The pnpm workspace includes `apps/*`, `services/express-api` and `services/nest-api`. Go services have independent Go modules. The Python AI service has its own requirements, application package, tests and Alembic migrations. Docker/Compose, Kubernetes, Terraform, monitoring and CI assets are maintained in their respective folders.

Read [Repository Layout](docs/repository-layout.md) and [Service Catalog](docs/architecture/service-catalog.md) before changing a boundary.

## 2. Source ownership

| Area | Primary owner |
|---|---|
| Browser and mobile experience | `apps/web`, `apps/mobile` |
| Public route policy | `services/api-gateway` |
| Identity, messages, notifications, Socket.IO | `services/express-api` |
| Conversations, tasks, calls, recording, jobs facade | `services/nest-api` |
| Asynchronous job submission/worker | `services/jobs-api`, `services/jobs-worker` |
| RAG, incident intelligence, conversation analysis, multi-agent, recording worker | `services/ai-service` |
| Deployment/monitoring/security automation | `infrastructure/`, `monitoring/`, `.github/` |

## 3. Development workflow

1. Start from a clean branch and identify all affected producers/consumers.
2. Read the route/schema/model and the relevant tests before editing.
3. Keep a change scoped to its owning service unless a contract requires a coordinated update.
4. Update dependency manifests and lockfiles together when packages change.
5. Add/adjust tests for happy path, invalid input, authorization, retry and failure behavior as applicable.
6. Update documentation and API descriptions in the same pull request.
7. Run the focused test suite, lint/typecheck/build and relevant consumer tests.
8. Inspect `git diff --check`, status and staged files before committing.

## 4. Contract discipline

- Gateway route allowlist is separate from upstream routes.
- Express REST/Socket.IO, Nest GraphQL/REST, Python internal FastAPI, Go HTTP and RabbitMQ payloads are distinct contracts.
- Internal bearer authentication and Relay user identity are separate concerns.
- Do not expose internal service endpoints by adding a proxy rule without a threat-model and API review.
- Preserve stable response fields or coordinate version/compatibility changes with all callers.

## 5. Data and migration discipline

- Use Prisma migrations for Nest relational schema.
- Use Alembic migrations for AI-service schema.
- Review MongoDB model compatibility and backfill needs.
- Preserve document/chunk tenant foreign keys and ownership semantics.
- Design cross-store changes for partial failure and safe retry.
- Include rollback and forward-recovery strategy.

## 6. Security review

Review authentication, authorization, CORS/trusted proxy behavior, body limits, rate limits, internal tokens, log privacy, secret injection, object storage permissions and tenant predicates. Shared Knowledge Base retrieval is cross-user; any change to visibility or data classes requires explicit review.

## 7. Testing evidence

Use the focused scripts in [Testing Strategy](docs/testing-strategy.md). Report the exact command and environment. A passing component test is not evidence of physical-device behavior; Kustomize rendering is not evidence of deployment; a green single-service workflow is not evidence that every service works together.

## 8. Pull request standard

Complete `.github/pull_request_template.md`. Include:

- problem and expected user/operational outcome;
- changed service boundaries and API/event/data contracts;
- authorization, privacy and threat considerations;
- tests, build output and manual/device validation;
- migration/deployment/rollback plan;
- documentation/runbook changes;
- known limitations and rollout risk.

## 9. Documentation and naming

Use concise headings, accurate file paths and executable commands. Mark implementation, proposal and production verification separately. Do not write unsubstantiated scale, compliance, SLO or certification statements. ADRs are historical decision records; supersede them with a new ADR rather than silently rewriting decision history.
