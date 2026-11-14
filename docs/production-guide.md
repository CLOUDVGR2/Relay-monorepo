# Release Engineering and Runtime Operations

**Purpose:** describe how Relay is built, configured, released, deployed, and operated. This guide is an operational framework grounded in repository manifests; it is not evidence that the supplied AWS templates have been deployed or that a production environment currently exists.

## 1. Release artifact model

A Relay release is a coordinated set of:

- source commit and reviewed change set;
- JavaScript workspace dependency graph and `pnpm-lock.yaml`;
- independent Go module dependencies (`go.mod` / `go.sum`);
- Python runtime and development requirements;
- built web/mobile assets and service container images;
- database migrations and compatible application versions;
- environment configuration and secret references;
- infrastructure manifests and deployment parameters;
- test, scan, and release evidence.

Build once and promote immutable artifacts. Do not rebuild different contents under the same release identifier. Record source SHA, build workflow, artifact digest, SBOM/provenance where available, and target environment.

## 2. Build and validation commands

The root package scripts provide the following entry points:

```bash
corepack pnpm install --frozen-lockfile
pnpm run build:all
pnpm run test:all
pnpm run typecheck:mobile
pnpm run test:e2e:web
pnpm run test:e2e:nest-api
```

The aggregate scripts do not replace focused service checks. Go services use their independent module directories; the AI service test script expects `services/ai-service/.venv/bin/python` with pytest installed.

Useful focused commands:

```bash
pnpm --filter @relay/web run lint
pnpm --filter @relay/web run test
pnpm --filter @relay/web run build
pnpm --filter @relay/mobile run typecheck
pnpm --filter @relay/express-api run test:integration
pnpm --filter @relay/nest-api run test
(cd services/api-gateway && go test ./...)
(cd services/jobs-api && go test ./...)
(cd services/jobs-worker && go test ./...)
( cd services/ai-service && .venv/bin/python -m pytest tests/ -v )
```

Use the exact toolchain versions in manifests and CI. Confirm current branch-specific CI triggers before treating a workflow as a required check.

## 3. Local Compose lifecycle

The root Compose file is `compose.yaml`.

```bash
docker compose -f compose.yaml config
docker compose -f compose.yaml up -d --build
docker compose -f compose.yaml ps
docker compose -f compose.yaml logs -f
# Shut down without deleting named volumes
docker compose -f compose.yaml down
```

Review volume behavior carefully before using `down -v`; it deletes persistent local service data. The Compose topology includes the application services, data stores, brokers, object storage, workers, and monitoring tools. It is a local integration environment, not an HA production deployment.

## 4. Configuration and secrets

Use committed `.env.example` files to understand configuration names. Never commit live secret values. In production, inject credentials through a managed secret system and least-privilege workload identity. The Kubernetes tree includes an External Secrets Operator integration path and the AWS Terraform contains optional supporting IAM resources; operators must provision and validate these dependencies before enabling workloads.

Separate configuration by environment:

- network addresses and externally reachable origins;
- authentication/session keys and service-to-service credentials;
- database, cache, and broker connection data;
- object storage bucket and IAM role settings;
- AI provider, model, embedding provider, model name, and token/time limits;
- telemetry endpoints and retention;
- feature switches and operational limits.

Document the owner, rotation procedure, and consumers for each secret. Avoid sharing one credential across unrelated services.

## 5. Database migration discipline

The Python AI service uses Alembic (`services/ai-service/alembic.ini`, `migrations/`). The Nest service uses Prisma schema and migrations. Treat schema changes as release artifacts:

1. identify all consumers and old/new application compatibility;
2. design an expand-migrate-contract sequence for online changes;
3. back up and verify restore before high-risk migrations;
4. run migration checks in an isolated environment;
5. apply the migration once through a controlled release step;
6. validate row counts, constraints, indexes, and application behavior;
7. retain a documented rollback or forward-repair plan.

Never assume a container startup will safely migrate production data unless that behavior is explicitly implemented and reviewed.

## 6. Deployment sequence

A controlled deployment should sequence:

1. approved change, owner, risk review, and release notes;
2. frozen dependency install, unit/integration/contract tests;
3. static analysis, secret/dependency/container scans;
4. build immutable image tags and record digests;
5. render and validate target manifests/configuration;
6. verify database migration compatibility;
7. deploy backward-compatible infrastructure and data changes;
8. roll out services in dependency-aware order;
9. run health/readiness and synthetic user journeys;
10. compare latency/error/queue/quality signals against baseline;
11. record acceptance or execute rollback/forward repair.

## 7. Rollback strategy

Rollback is not just reverting an image. It must account for schema state, queued messages, cache formats, object metadata, API compatibility, and client version skew. Prefer backward-compatible expand migrations. For destructive data transformations, use a forward-repair plan unless a verified reverse migration exists.

## 8. Release records

For each release retain:

- source commit and change log;
- build workflow run and test summaries;
- image digests and dependency lockfile identity;
- SBOM and scan results where produced;
- rendered Kubernetes manifests or Compose configuration checksum;
- migration versions;
- deployment timestamp, environment, operator, and rollout status;
- post-deploy health and SLO evidence;
- rollback or mitigation record if invoked.

## 9. Production limitations to close before launch

The repository is a substantial implementation and deployment foundation, but production readiness is an evidence-based decision. Confirm real environment ownership, HA topology, managed data services, secret/identity wiring, backups and restore tests, alert routing, on-call coverage, privacy/legal review, capacity tests, runbooks, and customer commitments. See [production-readiness gates](production-readiness-gates.md).

## Related documents

- [AWS deployment architecture](architecture/aws-deployment.md)
- [AWS deployment checklist](aws-deployment-checklist.md)
- [Backup and disaster recovery](operations/backup-and-disaster-recovery.md)
- [Incident response](operations/incident-response.md)
