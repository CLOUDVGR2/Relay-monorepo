# Engineering Standards

## 1. Service ownership and modularity

Every capability has one authoritative domain owner. Clients render and orchestrate interaction; services validate and authorize; repositories own persistence access; workers own background execution. Avoid duplicate business rules across clients or gateway layers.

## 2. API and event contracts

Document and test:
- HTTP method, path, authentication, validation, response schema, and error codes;
- GraphQL operations, input types, field nullability, pagination, and guard behavior;
- Socket.IO event names, handshake identity, room membership, and payload schema;
- AMQP queue/exchange names, routing, payload version, retry metadata, and acknowledgement rules;
- environment variables, defaults, startup validation, and secret classification.

Prefer additive evolution. For breaking changes, define consumer migration and compatibility windows.

## 3. Authentication and authorization

Derive user identity from verified credentials, not client-controlled owner fields. Enforce object-level authorization in the domain service or data-access query. Tenant scoping must occur before data retrieval and before model context construction. Treat internal bearer authentication and end-user authorization as separate controls.

## 4. Input and resource bounds

Set explicit limits for body size, upload size, pagination, GraphQL complexity, model token budgets, concurrency, job duration, retries, and queue prefetch. Reject unknown fields where strict request schemas are appropriate. Use deadlines and bounded pools for downstream calls.

## 5. Data integrity

Use migrations for schema evolution. Define transaction boundaries and unique constraints. For workflows spanning PostgreSQL, MongoDB, Redis, RabbitMQ, and object storage, use explicit state transitions, durable idempotency, and reconciliation. Never imply distributed atomicity where no transaction coordinator exists.

## 6. Reliability and asynchronous work

Use manual acknowledgements when processing semantics require explicit completion. Publish retry or dead-letter messages with confirmation before acknowledging the original delivery. Classify permanent validation errors separately from transient dependency failures. Make shutdown bounded and recoverable.

## 7. AI and retrieval

Treat source documents, retrieved chunks, model outputs, and tool responses as untrusted. Enforce tenant filters before retrieval. Record model/provider and embedding configuration needed for reproducibility. Bound input size, chunk count, context tokens, provider concurrency, and execution duration. Validate structured outputs before persisting or acting on them.

## 8. Observability

Use structured logs with correlation identifiers and low-cardinality metric labels. Do not log credentials, cookies, raw authorization headers, or unnecessary user content. Distinguish liveness, readiness, dependency health, queue progress, and user-journey success.

## 9. Testing strategy

Use focused unit tests for deterministic logic, integration tests for persistence and broker contracts, API tests for authentication/authorization, and E2E tests for user journeys. Add negative-path assertions for invalid input, unauthorized access, retries, duplicate delivery, dependency failure, and recovery.

## 10. Review requirements

A change is reviewable when its ownership, contract impact, security implications, data migration, operational behavior, test evidence, and documentation updates are explicit.
