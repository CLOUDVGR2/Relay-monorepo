# Relay Engineering Handbook

## 1. Repository model

Relay is a pnpm monorepo containing browser and mobile clients, Node.js APIs, Go services, a Python AI service, and infrastructure-as-code. Service boundaries are represented by package manifests, Go modules, Python dependency manifests, Dockerfiles, Compose services, Kubernetes resources, and CI workflows.

The root workspace is the orchestration point for JavaScript packages. Go and Python components retain their native build and test toolchains.

## 2. Source ownership

| Area | Canonical implementation |
|---|---|
| Browser client | `apps/web/` |
| Native client | `apps/mobile/` |
| Public gateway | `services/api-gateway/` |
| Collaboration HTTP and realtime | `services/express-api/` |
| GraphQL, calls, tasks, recording uploads | `services/nest-api/` |
| Job submission and status | `services/jobs-api/` |
| Queue processing | `services/jobs-worker/` |
| AI, retrieval, incident intelligence, multi-agent execution, recording worker | `services/ai-service/` |
| Container and Kubernetes delivery | `infrastructure/` and `compose.yaml` |

A service's implementation and its tests define the executable contract. Documentation describes those contracts and must be updated when interfaces or operational semantics change.

## 3. Development workflow

1. Identify the owning service and downstream consumers.
2. Read the route, resolver, DTO/schema, persistence layer, and relevant tests before changing behavior.
3. Preserve API compatibility or document and test an intentional contract migration.
4. Add focused tests for normal, invalid, unauthorized, duplicate, and dependency-failure paths as applicable.
5. Run the owning service's formatter, linter, type checker, build, and tests.
6. Run integration checks for cross-service changes.
7. Validate Compose or Kustomize configuration when deployment behavior changes.
8. Update architecture, API, security, and operational documentation in the same change.
9. Record exact verification commands and outcomes in the pull request.

## 4. Contract discipline

- HTTP methods, paths, authentication modes, schemas, status codes, and error semantics are part of the API contract.
- GraphQL field and mutation names, input types, nullability, authorization guards, and pagination are versioned interfaces.
- Socket.IO event names, payloads, room membership, and handshake authentication are compatibility-sensitive.
- RabbitMQ routing keys, queue names, message schemas, delivery mode, retry metadata, and acknowledgement semantics are service contracts.
- Database columns, indexes, constraints, migration order, and ownership boundaries are persistence contracts.
- Environment variables are deployment interfaces and require validation and examples.

## 5. Security review

For every change, assess identity provenance, authorization scope, tenant boundaries, input validation, secret handling, logging, request limits, dependency trust, and replay/idempotency behavior. Treat browser state, mobile payloads, model outputs, retrieved documents, queue messages, and forwarded headers as untrusted inputs.

Never add credentials, populated environment files, signing keys, tokens, or production connection strings to version control.

## 6. Testing and evidence

Use the root scripts for common workspace checks:

```bash
pnpm test:all
pnpm build:all
pnpm typecheck:mobile
```

Run service-specific checks where the root scripts do not cover the relevant workflow. Go services use `go test ./...`, `go vet ./...`, and `go build ./...`. Python tests use the service virtual environment and pytest. Infrastructure changes require Kustomize rendering, Terraform formatting/validation, and the relevant policy/security checks.

A passing unit test is evidence for the assertions it executes. Integration and deployment claims require corresponding integration or environment evidence.

## 7. Pull request standard

A reviewable pull request includes:
- concise purpose and user/operator impact;
- owning services and consumers;
- contract, schema, and configuration changes;
- security and privacy analysis;
- focused and broader verification results;
- rollout, migration, and rollback considerations;
- documentation updates.

The repository pull-request template is the canonical checklist.
