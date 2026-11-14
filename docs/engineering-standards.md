# Relay Engineering Standards

These standards define how changes should preserve contract ownership, security, reliability and reviewability across the monorepo.

## 1. Service ownership and modularity

- Keep domain behavior in the service that owns the contract.
- The Gateway forwards a narrow allowlist; do not move domain policy into proxy code.
- Express owns collaboration-oriented REST/realtime routes; NestJS owns the conversation/task/call domain and selected REST facades; Python owns AI workflows; Go worker/API own job transport and processing.
- Keep workers separate from interactive HTTP processes.
- Avoid cross-service database writes unless the owning data boundary explicitly permits them.

## 2. API and event contracts

- Validate all untrusted inputs at the boundary.
- Bound payload size, collection size, string length, `top_k`, task steps, timeouts and pagination.
- Use stable error categories and avoid leaking provider/internal exception details.
- Treat GraphQL, REST, Socket.IO and AMQP as separate contracts with separate compatibility tests.
- Update OpenAPI/GraphQL schema, route documentation, callers and consumer tests together.
- Do not expose an internal route simply because it appears in an upstream OpenAPI document.

## 3. Authentication and authorization

- Distinguish user authentication from service-to-service authentication.
- Propagate a stable Relay user identity only through trusted backend service calls.
- Apply ownership/tenant predicates in the data access layer for private resources.
- Test authorization denial as well as success, including cross-user and stale/deleted account cases.
- Test Socket.IO handshake and room membership independently of HTTP middleware.
- Keep secrets out of mobile/web bundles, logs, tests and documentation.

## 4. Data integrity

- Preserve foreign keys, unique constraints and tenant consistency.
- Use Prisma migrations for Nest relational models and Alembic migrations for AI-service models.
- Prefer additive schema changes and expand/migrate/contract rollout.
- Document cross-store compensation and recovery behavior.
- Treat object storage metadata and database state as related recovery domains.
- Define deletion and retention behavior for derived embeddings, recordings, transcripts and summaries.

## 5. Reliability and asynchronous work

- Set explicit deadlines and bounded concurrency.
- Retry only when the operation is safe; use idempotency keys for retried mutations.
- Do not acknowledge a broker message until processing or retry/DLQ publication is durable enough for the contract.
- Use leases/fencing to prevent stale workers from overwriting newer claims.
- Track queue age, retry attempts, DLQ depth and worker heartbeat freshness.
- Gracefully stop accepting new work and complete/requeue in-flight work within a deadline.

## 6. AI and retrieval

- Treat document content, prompts and model output as untrusted.
- Separate embedding configuration from generation configuration.
- Preserve embedding dimensions and model-version metadata; re-embed when compatibility changes.
- Validate generated JSON and cited IDs against retrieved evidence.
- Provide deterministic domain rules only where the source format supports reliable extraction; test both positive and negative cases.
- Measure retrieval relevance and factual grounding, not just HTTP success.
- Enforce data visibility inside retrieval query predicates. Uploader display names are attribution, not authorization.

## 7. Observability

- Use bounded/low-cardinality metric labels.
- Include request IDs for cross-service correlation where supported.
- Do not log tokens, passwords, full prompts, transcripts, raw document content, signed URLs or unnecessary personal data.
- Separate liveness, readiness, dependency health and worker heartbeat.
- Expose meaningful error categories and operational state transitions.

## 8. Testing and verification

- Add unit tests for deterministic domain logic.
- Add integration tests for persistence, middleware, service adapters and broker behavior.
- Add contract tests for routes/events consumed by other services.
- Add negative authorization tests and malformed-input tests.
- Run the relevant service suite and affected consumer suites.
- Record commit SHA, exact command, environment and result.
- Do not claim full-platform validation from a single web/unit suite.

## 9. Review requirements

A significant change should include:

1. problem statement and affected service owners;
2. route, data, event and dependency impacts;
3. threat/authorization analysis;
4. migration and rollback plan;
5. test evidence and known gaps;
6. observability and support impact;
7. documentation and operator updates.

## 10. Documentation standard

Documentation must state source-backed facts, mark proposals explicitly and avoid unsupported scale/compliance/SLO claims. Source locations should be linked where useful. Keep commands aligned to package manifests and service scripts. See [Code Commenting Standard](code-commenting-standard.md) for source-code comments.
