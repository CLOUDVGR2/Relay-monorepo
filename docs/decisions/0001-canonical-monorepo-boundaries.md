# ADR 0001: Canonical monorepo boundaries

- **Status:** Accepted as repository organization policy
- **Date:** 2026-10-21
- **Owners:** Relay maintainers
- **Related:** [Repository layout](../repository-layout.md), [Architecture](../architecture.md), [Engineering standards](../engineering-standards.md)

## Context

Relay contains a browser application, several independently runnable backend services, asynchronous processing, AI/RAG code, deployment assets, and tests across multiple languages. A prior source layout contained two Express-oriented trees, creating ambiguity about which implementation is canonical. A monorepo must make ownership and build/deploy paths discoverable without implying that all services share one release lifecycle.

## Decision

- Keep the browser application under `apps/web/`.
- Keep canonical independently runnable backend services under `services/<service-name>/`.
- Keep the root `compose.yaml` as the canonical local orchestration entry point.
- Keep Kubernetes and deployment assets under `infrastructure/`.
- Keep repository-wide integration tests under `tests/` and service-owned tests beside their service.
- Preserve the non-canonical Express tree under `archive/express-api-legacy/` until equivalence, dependencies, and removal risk have been reviewed explicitly.
- Treat source directory names, runtime Compose service names, DNS names, and Kubernetes resource names as separate identities that must be mapped and validated, not assumed to be interchangeable.
- Do not create shared packages until there is a stable cross-service contract and a named owner.

## Alternatives considered

- **Delete the legacy Express tree immediately:** rejected because source presence alone does not establish equivalence or prove that no workflow depends on it.
- **Keep both Express trees as peer services:** rejected because it preserves ambiguity about ownership and canonical behavior.
- **Move all code into one deployable application:** rejected because it would erase existing service and runtime boundaries without a demonstrated requirement.

## Consequences

The structure is easier to navigate and supports independent service workflows. Cross-service changes still require coordinated contract, Compose, CI, Nginx, and Kubernetes validation. The legacy tree adds temporary repository weight; it should be removed only after a documented equivalence and reference review.

## Verification

The repository inventory and static path checks are documented in [Implementation Status](../implementation-status.md). Runtime tests, container builds, Kubernetes rendering, deployment validation, and legacy-service equivalence remain separate evidence gates and must not be inferred from this ADR.
