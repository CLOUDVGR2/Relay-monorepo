# Security and Operational Architecture

## 1. Identity domains

Relay separates user identity from service identity.

- Express loads the authenticated Relay account from MongoDB and attaches selected identity fields to the request.
- Native clients use the bearer-token mode; browser clients use the configured cookie/session behavior.
- NestJS HTTP and GraphQL guards validate authenticated user context.
- Python service routes require an internal bearer token. Tenant context is carried separately as `X-Relay-User-Id`.
- Go Jobs API internal job operations require an internal bearer token.

A valid internal token proves that the caller is an authorized service principal under the configured shared-secret model; it does not prove that the Relay user referenced in the request is allowed to access every resource. Resource ownership predicates remain necessary.

## 2. Request boundary controls

### Gateway

- Explicit route allowlist to Express and NestJS.
- Request ID validation/generation and downstream propagation.
- Security response headers.
- Trusted proxy CIDR parsing before using forwarded client/protocol metadata.
- Bounded transport behavior and upstream timeouts.
- Normalized upstream error handling.

### Express

- Helmet security headers.
- Credentialed CORS with configured origin allowlist.
- Cookie parsing and protected route middleware.
- Default 1 MiB JSON body parsing with larger bounded parsing only for designated image routes.
- Authentication and route-specific rate limiting.
- Request metrics without raw URL/user data collection.

### NestJS

- Environment validation and fail-fast configuration checks.
- Helmet and credentialed CORS.
- Cookie parsing, HTTP/GraphQL guards, request context and timing.
- Global exception normalization.
- DTO/schema input validation and service-call response validation.

### Python AI

- Internal bearer dependency on protected API routers.
- Pydantic request schemas and bounds.
- Relay identity validation before tenant resolution.
- Model response JSON and citation-ID validation.
- Process-local metrics protected by internal bearer authentication.

## 3. Data protection

MongoDB, PostgreSQL, Redis, RabbitMQ and object storage carry different classes of data. Production deployment must define encryption in transit/at rest, key ownership, backup encryption, secret rotation, retention, access logging and deletion semantics. The source repository does not establish the settings of a live managed service.

## 4. Shared Knowledge Base risk

The current RAG product behavior allows search and answer retrieval across tenant IDs. Document ingestion, list and direct fetch remain user-tenant scoped, but this does not create document confidentiality. An authenticated user can receive excerpts from another user's indexed upload through answer/search. Uploader attribution does not restrict access.

Before use with data that must be isolated, introduce an explicit visibility policy and enforce it in both vector and keyword retrieval queries. Add negative tests for unauthorized retrieval and ensure citations/exports cannot bypass the policy.

## 5. Operational signals

Health endpoints, metrics and worker heartbeats are distinct:

- process liveness asks whether a process responds;
- readiness asks whether required dependencies allow it to accept work;
- dependency probes check a specific service;
- worker heartbeat checks whether background processing is active;
- synthetic journeys validate user-visible workflows.

A passing readiness endpoint is not proof of model-provider availability, queue progress, object storage health or a complete recording workflow unless those dependencies are explicitly included in that endpoint.

## 6. Secure operations

- Keep internal services on private networks.
- Use environment-specific tokens and least-privilege IAM/object-store policies.
- Verify trusted proxy CIDRs and CORS origins for each deployment.
- Review public Gateway and NGINX routes before exposure.
- Rotate secrets and maintain a break-glass process.
- Retain audit/security signals without storing unnecessary personal content.
- Test authorization for REST, GraphQL, Socket.IO, background job ownership and AI tenant operations.
- Keep backup/restore and incident procedures accessible to authorized responders.

## 7. Evidence limitations

A middleware, manifest or policy file does not by itself prove deployment enforcement. Record the target cluster/account, active configuration, network policy, secret binding, runtime identity, scan report and test result when asserting control effectiveness.
