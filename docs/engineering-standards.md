# Engineering Standards

These standards apply to application code, APIs, asynchronous processing, infrastructure, documentation and operational procedures. They are review criteria, not evidence that a particular control is already implemented.

## 1. Architectural ownership

- Every service must have an explicit owner, responsibility, runtime contract, configuration contract, and operational boundary.
- Keep transport concerns, domain rules, persistence, and infrastructure integration separable enough to test independently.
- A service must not write directly to another service's private schema without an explicitly approved ownership contract.
- Prefer explicit HTTP/GraphQL APIs or versioned events to hidden cross-service coupling.
- Introduce shared packages only when multiple consumers need a stable abstraction and an owner accepts its compatibility burden.
- Preserve behavior during refactoring unless the change request explicitly authorizes a behavior change.
- Do not silently delete duplicate or apparently unused code; prove ownership and references, then remove it in a reviewed change.
- Record material architecture choices and their trade-offs.

## 2. API and event contracts

- Define request/response schemas, authentication requirements, authorization rules, status codes, error shape, pagination and rate limits.
- Validate all untrusted inputs at the service boundary. Do not rely on client-side validation.
- Return safe, stable error responses; never serialize stack traces, secrets, raw provider responses or database internals.
- Make timeout behavior and retryability explicit.
- Add compatibility tests for public or cross-service contracts.
- Version breaking HTTP, GraphQL, queue-message and persisted-schema changes intentionally.
- For GraphQL, bound query depth/complexity, fan-out, pagination and execution time.
- For events, include a schema/version strategy, correlation identifiers, producer identity where useful, and a defined unknown-field policy.
- Treat queue messages as untrusted input even when the broker is private.

## 3. Identity, authentication and authorization

- Enforce authorization server-side for every protected resource and operation.
- Establish identity from trusted credentials, not client-supplied user or tenant identifiers.
- Test horizontal and vertical privilege boundaries, including object-level authorization and tenant isolation.
- Authenticate service-to-service calls where the threat model requires it; network location alone is not identity.
- Define session/token expiry, refresh, revocation, rotation and invalidation behavior.
- Protect cookies with appropriate Secure, HttpOnly and SameSite attributes for the deployment.
- Configure CORS and proxy trust deliberately; neither mechanism is an authorization control.
- Audit security-sensitive actions without logging credentials or unnecessary personal data.

## 4. Secrets and configuration

- Keep secrets out of source, fixtures, logs, documentation, browser bundles, CI output and shell history.
- Use unique credentials per environment and least-privilege permissions per service.
- Validate required configuration at startup and fail closed for security-critical settings.
- Document variable purpose, owner, default, secret classification, validation and rotation procedure.
- Treat all frontend build-time variables as public.
- Rotate exposed credentials and document downstream restart/rollout needs.
- Avoid silent security-sensitive defaults and hardcoded production endpoints.

## 5. Data integrity and migrations

- Define schema ownership, transaction boundaries, uniqueness constraints, indexes, retention and deletion behavior.
- Design for concurrent writes, duplicate requests and partial failure.
- Use bounded transactions and database timeouts; avoid unbounded scans on request paths.
- Prefer expand/migrate/contract for rolling schema changes.
- Test migrations against representative data and verify both forward migration and recovery strategy.
- Never assume an old application version can safely run against a new schema.
- Document backup consistency, restore order and application-level integrity checks.
- Separate cache/coordination state from authoritative business data.

## 6. Reliability and asynchronous work

- Bound all network operations with explicit deadlines.
- Retry only transient failures and use capped exponential backoff with jitter where appropriate.
- Do not retry non-idempotent side effects without a reliable idempotency strategy.
- Distinguish job accepted, scheduled, running, succeeded, retrying, failed and cancelled states where relevant.
- Define broker durability, acknowledgements, retry limits, dead-letter handling, message expiry and poison-message behavior.
- Test crash windows around side effects and acknowledgements.
- Implement graceful shutdown and stop accepting work before terminating active processing.
- Use circuit breakers or bulkheads only where failure isolation benefits are understood and observable.
- Treat “exactly once” as a business-level outcome to be designed and verified, not a broker configuration claim.

## 7. AI and retrieval systems

- Treat prompts, retrieved documents, user uploads, model outputs and tool results as untrusted.
- Enforce authorization before retrieved content is passed to a model.
- Bound file size, decompression, number of chunks, context size, token usage, provider concurrency and wall-clock duration.
- Version embedding model, chunking configuration, index, prompt template and provider configuration.
- Test empty retrieval, stale indexes, conflicting evidence, provider timeout, rate limiting, malformed output and cancellation.
- Redact sensitive content from logs and traces.
- Make tool permissions explicit and least-privileged; model output must not bypass normal authorization.
- Measure retrieval quality and generation quality separately from HTTP availability.
- Record provider and cost metadata at a privacy-appropriate level.

## 8. Observability

- Use structured logs with timestamp, service, severity, event name, correlation/request ID and safe error class.
- Never log passwords, access tokens, session cookies, private keys or full connection strings.
- Define liveness, readiness and dependency-health semantics separately.
- Instrument request rate, error rate, latency distribution, saturation and dependency behavior.
- For workers, measure queue depth/age, retries, redelivery, job duration and terminal failures.
- Propagate correlation/trace context across HTTP and queue boundaries where supported.
- Ensure metrics labels are bounded; do not use user IDs, raw URLs or unbounded exception strings as labels.
- Alert on user-impacting symptoms and actionable thresholds, not only process restarts.

## 9. Performance and resource controls

- Bound request size, response size, concurrency, queue depth, job duration, database pools and external provider usage.
- Use pagination or streaming for unbounded collections.
- Measure before optimizing and include representative workloads.
- Test p50/p95/p99 latency, throughput, error rate, saturation and queue age under load.
- Design backpressure and overload responses instead of allowing unbounded memory growth.
- Set resource requests/limits and autoscaling thresholds from evidence.
- Evaluate cache invalidation and consistency before adding caching.

## 10. Testing strategy

Use the narrowest meaningful test first, then broader suites:
- **Unit:** pure business rules and isolated algorithms.
- **Component:** module behavior with controlled dependencies.
- **Integration:** real framework, persistence, broker or external-service boundaries where practical.
- **Contract:** consumer/provider compatibility for HTTP, GraphQL, events and schemas.
- **End-to-end:** high-value user and operational journeys across real service boundaries.
- **Resilience:** timeouts, dependency outage, retries, duplicate delivery, process restart and graceful shutdown.
- **Security:** authentication, authorization, tenant isolation, input handling and abuse cases.
- **Performance:** representative load and saturation behavior.

Tests must be deterministic, isolated, repeatable and explicit about required infrastructure. Do not turn skipped tests or mocks into claims of end-to-end verification.

## 11. Code review requirements

Reviewers should ask:
- Does the change preserve service ownership and contract compatibility?
- Are all untrusted inputs validated and all protected operations authorized?
- Are failure, timeout, retry and cancellation paths correct?
- Are database and queue side effects safe under concurrency and duplicate delivery?
- Are secrets and sensitive data protected in logs, responses and browser bundles?
- Are migrations compatible with rollout and rollback?
- Are tests asserting meaningful behavior rather than implementation details?
- Are metrics and runbooks adequate for a production failure?
- Are docs and examples consistent with actual source and deployment configuration?
- Is complexity justified by a concrete requirement?

## 12. Repository hygiene and delivery

- Use consistent kebab-case for documentation filenames and canonical service names for source directories.
- Keep one canonical Compose entry point and avoid duplicated deployment sources of truth.
- Update Docker build contexts, CI steps, Nginx upstreams, package scripts, Kustomize references and documentation whenever a path changes.
- Run path/reference scans after structural refactors.
- Keep lockfiles in sync with package manifests.
- Do not commit generated build outputs, local databases, virtual environments, or secrets unless a specific artifact is intentionally versioned.
- Document exact commands run and the commit/environment against which they passed.
- Never label a release production-ready without accountable sign-off and evidence.

## 13. Definition of done

A change is complete when:
1. behavior and ownership are clear;
2. the relevant contracts and configuration are updated;
3. tests cover the changed behavior and critical failure paths;
4. security and migration impacts are reviewed;
5. build/deployment references are consistent;
6. observability and operational implications are documented;
7. validation results are recorded accurately;
8. unresolved risks have an owner and explicit disposition.
