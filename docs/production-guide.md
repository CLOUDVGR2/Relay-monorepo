# Release Engineering and Runtime Operations

## Release artifact model

A Relay release is a coordinated set of versioned client bundles, service container images, database migrations, configuration values, and deployment manifests. Build and promote immutable artifacts; do not rebuild different content under the same release identifier.

## Build pipeline

1. Resolve JavaScript dependencies from `pnpm-lock.yaml`.
2. Build web and Node/Nest packages with their workspace scripts.
3. Build each Go module using its own `go.mod`.
4. Install Python dependencies from the service requirements manifests.
5. Build service images using the Dockerfiles selected by Compose or Kubernetes.
6. Run focused tests, aggregate tests, static analysis, secret scanning, dependency scanning, container scanning, and manifest validation.
7. Publish images with traceable tags and digests.
8. Deploy the same verified artifact set to the target environment.

## Configuration model

Configuration is injected at runtime. Public client build variables are distinct from server secrets. The root `.env.example`, service-level examples, Compose configuration, and Kubernetes ConfigMaps/Secrets describe different parts of the contract.

Secret classes include:
- user authentication signing material;
- internal API bearer tokens;
- database and broker credentials;
- object-storage credentials;
- model-provider credentials;
- observability administrator credentials.

Use environment-specific values and least-privilege service identities. Never copy local `.env` values into manifests or documentation.

## Deployment sequence

1. Verify the target account, cluster, namespace, registry, and deployment identity.
2. Validate configuration and secret references.
3. Confirm database backups and migration compatibility.
4. Apply infrastructure prerequisites and storage resources.
5. Publish or promote immutable application images.
6. Apply the selected Kustomize overlay.
7. Observe rollout status, readiness, logs, and metrics.
8. Run authenticated smoke tests and representative user journeys.
9. Confirm asynchronous queues and worker heartbeats.
10. Record release metadata and retain rollback artifacts.

## Schema and data evolution

Deploy backward-compatible schema changes before code that requires them. Use expand/migrate/contract for incompatible data model changes. Coordinate producer and consumer compatibility for RabbitMQ messages and service API changes. Treat object-storage metadata and database state as related recovery domains.

## Rollback

Rollback application artifacts only when their schema and message contracts remain compatible with the current data state. Database rollback is not a default application rollback strategy. Preserve logs, metrics, and the release manifest for diagnosis.

## Operational acceptance

A release record should include commit SHA, image digests, migration revision, environment, deployment time, verification commands, smoke-test outcomes, and operator approval. Runtime readiness is established by the target environment, not by a successful local build alone.
