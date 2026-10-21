# Contributing to Relay

## 1. Engineering expectations

Relay is a multi-service repository. A change that appears local may affect API compatibility, event delivery, data ownership, container builds, service discovery, or deployment manifests. Start by identifying the owning service and all consumers of the changed contract.

Before implementation:
1. Read [Architecture](docs/architecture.md) and [Engineering Standards](docs/engineering-standards.md).
2. Confirm canonical source path and runtime service identity.
3. Review [Code Commenting Standard](docs/code-commenting-standard.md) and relevant architecture decision records.
4. Identify API, event, schema, environment-variable, and deployment dependencies.
5. Define observable acceptance criteria and failure behavior.
6. Decide which tests provide evidence for those criteria.

## 2. Repository structure rules

- Browser code belongs in `apps/web/`.
- Independently runnable backend services belong in `services/<service-name>/`.
- Shared runtime infrastructure and deployment assets belong in `infrastructure/`.
- The canonical local Compose file remains `compose.yaml` at the root.
- Repository-wide scripts and contracts should have explicit ownership and should not become an unbounded catch-all.
- `archive/express-api-legacy/` is retained for provenance and is not the canonical Compose Express service.
- Avoid adding a second copy of the same service, deployment definition, or documentation without a clear reason and owner.

## 3. Development workflow

1. Create a focused branch from the current integration branch.
2. Make the smallest coherent change that satisfies the requirement.
3. Add or update tests for expected behavior and important failure modes.
4. Update documentation, environment examples, and runbooks when contracts or operations change.
5. Run the narrowest relevant checks, then broader checks for cross-service changes.
6. Review `git diff` for secrets, generated files, unrelated formatting churn, and accidental behavior changes.
7. Record the commands run and any checks that could not be run.

## 4. Validation

Use root scripts after installing the relevant dependencies:

```bash
npm run test:express-api
npm run test:nest-api
npm run test:web
npm run test:ai-service
npm run test:jobs-api
npm run test:jobs-worker
npm run test:api-gateway
npm run test:all
```

The Python script expects the virtual environment at `services/ai-service/.venv/`. Go services have separate modules and may declare different minimum Go versions. Container and integration tests may require Docker, database services, RabbitMQ, Redis, model providers, or explicit test flags.

Before a cross-service or infrastructure change, also run:

```bash
docker compose config --quiet
git diff --check
```

If Docker or another prerequisite is unavailable, state that validation was not run. Do not report a static review as a test pass.

## 5. API, event and schema changes

- Identify all known consumers and providers.
- Prefer additive changes and expand/migrate/contract database migrations.
- Define behavior for unknown fields, duplicate messages, timeouts and partial failure.
- Add contract tests where services deploy independently.
- Update examples and docs to match actual route and payload behavior.
- Do not promise exactly-once processing without a defined idempotency boundary and failure-window tests.

## 6. Security review

For every change, consider authentication, authorization, tenant isolation, injection, SSRF, file size/resource limits, secret handling, logging, CORS, proxy trust, dependency risk and denial-of-service exposure. AI and retrieval changes must additionally consider prompt injection, retrieved-content authorization, model/tool permissions, token limits and provider data handling.

Report vulnerabilities privately using the process in [SECURITY.md](SECURITY.md).

## 7. Pull request checklist

- [ ] Change is scoped and service ownership is clear.
- [ ] Public and internal contracts are compatible or intentionally versioned.
- [ ] Tests cover normal, invalid, unauthorized and dependency-failure paths as appropriate.
- [ ] Configuration and secret requirements are documented.
- [ ] Docker build contexts, Compose service identities, Nginx upstreams, CI paths and Kubernetes references are consistent.
- [ ] Migrations are safe for rolling deployment and rollback.
- [ ] Logs/metrics are useful and do not expose sensitive data.
- [ ] Documentation and operational instructions match the implementation.
- [ ] Validation evidence includes actual commands and outcomes.
- [ ] Remaining risks are explicitly listed rather than implied to be resolved.
- [ ] Comments document intent and invariants without narrating obvious syntax.
