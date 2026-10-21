# Relay NestJS API

The `services/nest-api/` directory contains a TypeScript backend service built with NestJS. It is separate from the canonical Express application in `services/express-api/`; verify the responsibility and contract of each service before changing routing or duplicating functionality.

## Source map

- `src/main.ts` — application bootstrap and HTTP server configuration.
- `src/` — modules, resolvers, providers, services, and application logic.
- `test/` — configured automated tests.
- `vitest.config.e2e.ts` — configuration for the E2E test command.

Inspect the current source to establish actual route prefixes, GraphQL schema, guards, configuration requirements, and persistence behavior. Do not infer that an endpoint or security control exists merely because it is described architecturally.

## Requirements and development

Use a supported Node.js release compatible with the package dependencies and npm. From the repository root:

```bash id="f6ox4r"
npm install --prefix services/nest-api
npm run dev:nest-api
```

Alternatively, start the service directly:

```bash id="h7k9ap"
npm run start:dev --prefix services/nest-api
```

Check `src/main.ts` and the configuration files for the effective port, route prefixes, environment variables, and middleware. Local, Compose, and Kubernetes configurations may differ.

## Build and verification

Run from the repository root:

```bash id="w9q8n2"
npm run build:nest-api
npm run test:nest-api
npm run test:e2e:nest-api
npm run lint --prefix services/nest-api
npm run test:cov --prefix services/nest-api
```

These scripts run the configured build, Vitest tests, E2E suite, Oxlint checks, and coverage run. E2E tests may require additional services and environment configuration. Coverage is not proof that all important requirements or failure cases are tested.

Report verification against the exact commit tested. Distinguish passed, failed, skipped, and not-run checks.

## API and GraphQL practices

Use the schema and resolvers as the authority for GraphQL operations. Review changes for compatibility, input validation, authorization, pagination, and query-cost controls. For HTTP routes, document methods, paths, authentication requirements, response codes, and error behavior.

For operations involving protected data:

- Enforce authentication and authorization on the server.
- Scope reads and writes to the authenticated principal and tenant where applicable.
- Validate and constrain user-supplied input.
- Avoid returning internal exception details, database information, or secrets.
- Define behavior for missing resources, invalid input, timeouts, and dependency failures.
- Test denied access as well as successful access.

Verify controls in the actual guards, resolvers, services, and data-access paths. A schema or test file alone does not prove that authorization is correct.

## Databases and consistency

Inspect database providers, ORM configuration, schema definitions, and migrations before changing persistence behavior. Understand ownership of each data entity, transaction boundaries, indexes, connection-pool limits, and migration ordering.

Changes must account for compatibility between deployed application versions, recovery from partial failure, and other services that consume the same data. PostgreSQL, MongoDB, Redis, and a message broker do not automatically share an atomic transaction.

Do not run destructive migrations against shared or production data without an approved change plan and a verified recovery procedure.

## Security and configuration

- Keep credentials out of source control, frontend bundles, and container images.
- Validate required configuration and fail safely when essential settings are missing.
- Use least-privilege database and broker accounts.
- Apply authorization consistently to protected HTTP and GraphQL operations.
- Bound request duration, query cost, and dependency waits.
- Redact tokens, personal information, and sensitive payloads from logs.
- Review CORS, cookie, CSRF, and WebSocket-origin settings against the actual authentication model.
- Review dependency updates and security findings regularly.

Do not print `.env` files or secret values during debugging. Kubernetes Secret objects alone do not establish a complete secret-storage, access-control, or rotation process.

## Reliability and operations

Define liveness and readiness checks according to their real implementation. Liveness should identify a process that needs restarting; readiness should indicate whether it can safely accept traffic. Never configure probes against guessed endpoints.

For operational acceptance, verify application logs, error reporting, request correlation, database connectivity, and meaningful service indicators in the target environment. Do not claim distributed tracing, centralized telemetry, alerting, or service-level objectives without evidence that the corresponding systems are configured and working.

Design external calls and asynchronous processing around bounded retries, timeouts, idempotency, graceful shutdown, partial failure, and recovery of unfinished work. Retrying does not guarantee exactly-once business execution.

## Troubleshooting

- **Build or type errors:** run `npm run build:nest-api` and resolve the first actionable error.
- **Startup failure:** check required configuration, port conflicts, module initialization, and dependency connectivity.
- **GraphQL failures:** inspect the actual schema, resolver validation, authorization, and redacted server logs.
- **Database errors:** verify connectivity, migrations, query behavior, and pool capacity without exposing credentials.
- **E2E failures:** check the E2E configuration, target URL, required services, test data, and environment variables.
- **Cross-service failures:** confirm actual API contracts and network configuration instead of assuming services share routes or semantics.

## Related documentation

- [Repository overview](../../README.md)
- [Architecture](../../docs/architecture.md)
- [Implementation and verification status](../../docs/implementation-status.md)
- [Engineering standards](../../docs/engineering-standards.md)
- [Production guide](../../docs/production-guide.md)
- [Security and operations](../../docs/security-and-operations.md)

## Readiness note

This document is a development guide, not deployment approval. Production readiness requires verified builds and tests, reviewed configuration, appropriate security checks, target-environment validation, and documented recovery procedures.
