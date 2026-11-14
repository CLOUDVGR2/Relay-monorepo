# ADR 0001: Canonical Monorepo Boundaries

- **Status:** Accepted
- **Scope:** repository organization and service ownership
- **Decision owners:** platform architecture and service maintainers

## Context

Relay contains browser and native clients, Node.js APIs, Go services, Python AI workflows, and deployment assets. A single source-control view improves cross-service review and release coordination, but each runtime needs an appropriate build, dependency, test, and deployment boundary.

## Decision

Use one repository with:

- a pnpm workspace for JavaScript/TypeScript applications and services;
- independent Go modules for the Gateway, Jobs API, and Jobs Worker;
- a dedicated Python AI service with its own dependency manifests and Alembic migrations;
- explicit `apps/`, `services/`, `infrastructure/`, `monitoring/`, `tests/`, and `.github/` boundaries;
- shared documentation and deployment composition at repository level.

The exact source map is maintained in [Repository Structure](../repository-layout.md).

## Alternatives

- **Separate repository per service:** stronger independent release ownership, but increases cross-service contract and change-coordination overhead.
- **Single language/runtime:** simpler toolchain, but would constrain existing service implementation choices and worker/runtime capabilities.
- **One shared dependency graph:** rejected because Go and Python have native module/dependency systems and do not belong in pnpm resolution.

## Consequences

### Benefits

- cross-service changes can be reviewed atomically;
- architecture and contracts have one canonical home;
- workspace tooling can coordinate Node packages;
- each Go/Python service retains its native dependency and release model.

### Costs

- CI must select toolchains by path and impact;
- shared repository permissions and review ownership require discipline;
- unrelated changes can increase build context and CI cost;
- dependency and artifact provenance span multiple package ecosystems.

## Verification

The decision is reflected by `pnpm-workspace.yaml`, root package scripts, independent `go.mod` files, Python requirement manifests, Dockerfiles, Compose services, and Kustomize resources.

## Revisit conditions

Revisit if independent service release cadence, source ownership, access-control requirements, or CI scaling becomes incompatible with the monorepo model.
