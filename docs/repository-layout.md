# Repository Layout and Migration Notes

## Canonical layout

| Concern | Canonical location | Rationale |
|---|---|---|
| Browser application | `apps/web/` | Separates user-facing application code from independently deployed backend services |
| Express + Socket.IO | `services/express-api/` | Explicit service identity; source originated from the old `backend/` directory used by Compose |
| NestJS API | `services/nest-api/` | Preserves its independent package, Prisma schema/migrations and test configuration |
| Go jobs API | `services/jobs-api/` | Names the service by its job-domain responsibility rather than implementation language alone |
| Go worker | `services/jobs-worker/` | Separates asynchronous execution from the synchronous HTTP API |
| Python AI service | `services/ai-service/` | Names the deployable service and its AI/RAG responsibility |
| Go gateway | `services/api-gateway/` | Explicit edge-routing role |
| Kubernetes | `infrastructure/kubernetes/` | Groups base resources, overlays and supporting infrastructure manifests |
| Deployment assets | `infrastructure/deploy/` | Separates deployment-oriented assets from application source |
| Jenkins support | `infrastructure/devops/` | Keeps CI support Dockerfiles and related assets together |
| Engineering documentation | `docs/` | Central index for architecture, engineering, operational and AI references |
| Local orchestration | `compose.yaml` | Root entry point retained for compatibility with Docker Compose and common developer workflows |

## Duplicate Express source

The source archive contained both `backend/` and `express-api/`, each with an Express-oriented Node package. The supplied root Compose configuration built `backend/`, which establishes the best available evidence for the active local runtime. The contents of `backend/` therefore became `services/express-api/`.

The separate `express-api/` directory was moved to `archive/express-api-legacy/` rather than deleted or merged automatically. Similar package names and dependencies do not establish behavioral equivalence. Before retiring the archived tree, compare:
- route registration and middleware ordering;
- authentication, authorization and session behavior;
- data models, indexes and persistence semantics;
- Socket.IO event names and room authorization;
- environment-variable contracts;
- Docker build behavior;
- test coverage and external integration behavior.

## Naming and deployment identity

Source-directory names, Compose service names, container image tags, Kubernetes Deployment names, Kubernetes Service DNS names, and Go module paths are related but separate contracts. A path move must not be treated as permission to rename all deployment identities indiscriminately.

This reorganization aligns Compose service keys and internal URLs with canonical names where the references were explicit and unambiguous. Kubernetes resources retain their existing resource names unless they are intentionally changed in a dedicated migration. This minimizes accidental changes to selectors, labels, image patching, ingress targets and existing cluster conventions.

## Required checks after any future move

For a directory or service rename, inspect and validate:
1. package scripts and lockfiles;
2. Docker build contexts and `.dockerignore`;
3. Compose service keys, `depends_on`, health checks and internal DNS URLs;
4. Nginx upstreams and path rewrites;
5. Go module declarations and imports;
6. GitHub Actions `working-directory`, cache paths and artifact paths;
7. Jenkins Docker contexts, image names, network aliases and smoke-test URLs;
8. Kustomize resource paths, labels, selectors, image patches and ingress backends;
9. environment examples and deployment overlays;
10. relative Markdown links and command snippets;
11. service tests, integration tests, image builds and deployment smoke tests.

## Validation boundary

Static path, JSON/YAML and relative-link checks can catch structural errors but cannot establish runtime equivalence. Container builds, service tests, gateway route tests, Kustomize renders, deployment smoke tests and recovery exercises remain separate verification gates. Record their actual outcomes in [Implementation Status](implementation-status.md).
