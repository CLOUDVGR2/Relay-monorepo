# ADR 0001: Canonical Monorepo Boundaries

- **Status:** Accepted
- **Scope:** Repository organization and service ownership

## Context

Relay contains browser and native clients, Node.js APIs, Go services, Python AI workflows, and deployment assets. Each runtime needs a clear source boundary while preserving a unified dependency, test, and release view.

## Decision

Use one repository with:
- a pnpm workspace for JavaScript/TypeScript packages;
- independent Go modules for gateway, jobs API, and worker;
- a dedicated Python service package with its own dependencies and migrations;
- explicit service directories under `apps/` and `services/`;
- shared deployment and CI assets under `infrastructure/` and `.github/`.

The canonical source directories are defined in [Repository Structure](../repository-layout.md).

## Consequences

The monorepo provides a single change-review and architecture context while retaining native toolchains and service-specific release artifacts. Cross-service changes can be reviewed together. CI must select the correct language toolchain and validate all affected consumers.

## Verification

Workspace manifests, Go module files, Python dependency manifests, Dockerfiles, Compose services, and Kustomize resources define the boundaries.
