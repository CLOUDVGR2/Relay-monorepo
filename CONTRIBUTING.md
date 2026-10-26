# Relay Engineering Handbook

## 1. Purpose and Engineering Principles

Relay is a multi-application, multi-service software system. Changes may cross frontend applications, HTTP and GraphQL APIs, real-time communication, persistent storage, background processing, AI integrations, container infrastructure, and CI/CD pipelines.

This handbook defines how engineers design, implement, validate, document, review, and deliver changes in this repository.

The engineering objective is not merely to make code pass locally. It is to produce software whose behavior, interfaces, security properties, operational requirements, and failure modes can be understood and verified by another engineer.

All contributions are expected to follow these principles:

1. **Correctness:** Implement the required behavior and define meaningful behavior for invalid inputs and dependency failures.
2. **Explicit ownership:** Every runtime component, API contract, schema, configuration setting, and operational procedure must have an identifiable owner.
3. **Contract integrity:** Changes must account for producers, consumers, persisted data, and independently deployed services.
4. **Security by design:** Authentication, authorization, data isolation, secret handling, and resource limits must be considered during design rather than added after implementation.
5. **Reproducibility:** Build and validation procedures should be repeatable from documented prerequisites.
6. **Observability:** Operationally significant behavior must be diagnosable without exposing credentials or sensitive data.
7. **Controlled change:** Database migrations, configuration changes, dependency upgrades, and infrastructure changes must account for deployment order and recovery.
8. **Evidence-based delivery:** A test, build, scan, or deployment is considered successful only when it has actually run and its result has been observed.
9. **Maintainability:** Prefer understandable designs, cohesive modules, explicit interfaces, and small changes over unnecessary abstraction or hidden coupling.
10. **Documentation parity:** Documentation must describe the implementation that exists, not an assumed future state.

## 2. Repository Scope and Component Ownership

Relay is organized as a monorepo. The root directory contains workspace configuration, shared development entry points, and repository-level orchestration. Applications, independently operated services, and infrastructure assets have dedicated locations.

The primary component boundaries are:

| Path | Responsibility |
| --- | --- |
| `apps/web/` | Browser-facing web application |
| `apps/mobile/` | Mobile application |
| `services/express-api/` | Express-based API and associated real-time integration |
| `services/nest-api/` | NestJS API, GraphQL operations, and Prisma-backed application data access |
| `services/api-gateway/` | Go API gateway |
| `services/jobs-api/` | Go jobs API |
| `services/jobs-worker/` | Go background-processing worker |
| `services/ai-service/` | Python AI service |
| `infrastructure/` | Infrastructure, deployment assets, and CI-related configuration |
| `docs/` | Architecture, decisions, implementation status, and engineering guidance |
| `compose.yaml` | Root local multi-service orchestration definition |
| `Jenkinsfile` | Jenkins pipeline definition |
| `package.json` | Root package scripts and repository-level package metadata |
| `pnpm-workspace.yaml` | pnpm workspace membership |
| `pnpm-lock.yaml` | Locked JavaScript and TypeScript dependency resolution |

This table describes intended ownership boundaries. It does not imply that every component is independently deployable, that every listed integration is enabled in every environment, or that a particular deployment topology has been verified.

Before changing a component, inspect its package or module manifest, entry points, tests, configuration, container definition, and actual consumers.

### 2.1 Canonical implementation

- Make changes in the current implementation under the owning application or service directory.
- Do not introduce duplicate implementations of an existing service merely to avoid understanding its current design.
- Do not recreate removed legacy directories or treat historical source as a runtime dependency.
- Do not move shared behavior across service boundaries without documenting the resulting ownership and dependency changes.
- Keep build configuration, runtime configuration, and deployment references consistent with the component's actual location.
- Treat generated code and lockfiles according to the owning tool's workflow; do not manually edit generated artifacts when a reproducible generation command exists.

The historical `archive/express-api-legacy/` directory is not part of the current canonical repository structure. New work must target `services/express-api/`.

### 2.2 Establishing ownership

For any non-trivial change, identify:

- The component responsible for the behavior.
- The public and internal interfaces affected.
- The authoritative data store and schema owner.
- Upstream dependencies and downstream consumers.
- Runtime configuration and secrets required.
- Build, test, deployment, and rollback implications.
- The person or team responsible for operational follow-up.

If ownership is ambiguous, resolve it before introducing another implementation or creating a new cross-service dependency.

## 3. Source of Truth and Documentation Hierarchy

Use the following sources in combination:

1. **Implementation:** Executable code defines the behavior currently implemented.
2. **Tests:** Tests document and verify selected behavioral expectations; passing tests do not prove every production property.
3. **Schemas and contracts:** GraphQL definitions, OpenAPI documents where present, validation schemas, database schemas, and event payload definitions describe explicit interfaces.
4. **Configuration:** Environment examples, Compose files, Dockerfiles, CI pipelines, and deployment manifests describe intended runtime and delivery configuration.
5. **Architecture documentation:** `docs/architecture.md` describes component responsibilities and relationships.
6. **Architecture decision records:** `docs/decisions/` records important decisions, their rationale, and their consequences.
7. **Operational and contribution documentation:** Runbooks and this handbook explain repeatable engineering procedures.

When sources disagree, do not silently choose the most convenient description. Inspect the implementation and its tests, determine which behavior is authoritative, then update the affected sources together.

Document discrepancies that cannot be resolved safely as explicit issues or known limitations.

## 4. Initial Repository Assessment

Before implementing a substantial change, establish the current state of the working tree and relevant tooling.

From the repository root:

```bash
pwd
git status --short --branch
git log -5 --oneline
git diff --check
git diff --stat

Inspect the relevant package manifests and implementation:

cat package.json
cat pnpm-workspace.yaml
cat services/express-api/package.json
cat services/nest-api/package.json

Only inspect files relevant to the change; the examples above are not a requirement to dump every manifest for every task.

Determine:

The active branch and intended integration branch.

Whether the working tree contains existing user changes.

Whether the repository's installed toolchain satisfies package and module requirements.

Which scripts are actually defined in the relevant manifests.

Whether tests require databases, message brokers, caches, external providers, containers, or credentials.

Whether the change affects shared packages, generated clients, schemas, migrations, or deployment artifacts.

Never discard, overwrite, reset, or reformat unrelated working-tree changes as part of a contribution. Review existing modifications before editing files that may already be in progress.

5. Development Workflow

5.1 Define the change

Write down the behavior being changed and the acceptance criteria before implementation.

For a feature or defect, identify:

The expected successful behavior.

Invalid and boundary inputs.

Authentication and authorization requirements.

Data consistency requirements.

Timeout, retry, and dependency-failure behavior.

Compatibility requirements for existing consumers.

Logging and monitoring needed to diagnose failures.

Relevant performance or resource constraints.

Acceptance criteria must be observable. Avoid requirements such as "works correctly" without specifying what correct behavior means.

5.2 Trace the complete execution path

For a request, event, or background job, trace the relevant path through:

Input transport and request parsing.

Authentication and authorization.

Input validation and normalization.

Application or domain logic.

Data access and transaction boundaries.

Outbound calls, event publication, or job scheduling.

Error mapping and response serialization.

Logging, metrics, tracing, and cleanup.

Tests and deployment configuration.

Not every flow uses every layer. Document which layers actually exist rather than adding unnecessary architectural layers to satisfy a diagram.

5.3 Implement a cohesive change

Keep the change focused on one coherent behavior or contract.

Prefer explicit interfaces and predictable control flow.

Validate untrusted input at the appropriate boundary.

Preserve existing authorization and tenant-isolation rules.

Use the existing error-handling and logging conventions where they are suitable.

Avoid introducing hidden network calls, global mutable state, or cross-service assumptions.

Do not silently swallow errors that affect correctness or observability.

Do not add retries without considering idempotency, retryable error classification, timeouts, backoff, and load amplification.

Do not introduce a dependency without reviewing its maintenance, licensing, security, compatibility, and operational implications.

5.4 Validate incrementally

Run the narrowest meaningful test first. Then run broader checks when the change affects shared interfaces, multiple services, infrastructure, or build configuration.

After validation:

git diff --check
git status --short
git diff --stat
git diff

Review the complete diff before considering the change ready for review.

6. Toolchains and Dependency Management

Relay contains JavaScript/TypeScript, Go, and Python components. Their dependency and toolchain requirements are not interchangeable.

6.1 JavaScript and TypeScript

Use the repository's declared pnpm workspace and lockfile.

Use the package manager version specified by repository metadata when one is declared.

Prefer frozen-lockfile installation in CI and reproducibility checks.

Run scripts defined by the target package rather than assuming a script exists.

Commit dependency manifest and lockfile changes together when required.

Review transitive dependency changes, peer dependency compatibility, native modules, and platform-specific installation behavior.

Avoid mixing npm-generated lockfiles into a pnpm-managed workspace without an explicit migration decision.

Typical root-level installation:

pnpm install --frozen-lockfile

This command requires the installed pnpm version to be compatible with the repository and the lockfile to be consistent with the manifests.

6.2 Go

Go services maintain their own module definitions and may require different Go versions.

Before changing a Go service:

cd services/<go-service>
go version
go env GOMOD
go test ./...

Replace <go-service> with the actual service directory.

Respect the go directive and any toolchain declaration in the module.

Review go.mod and go.sum changes together.

Avoid upgrading unrelated modules as incidental churn.

Run vulnerability checks with a compatible toolchain when the change concerns security or dependencies.

Do not infer that all Go services share one minimum Go version.

6.3 Python

Use the Python version and dependency workflow documented by the AI service.

The repository may use a service-local virtual environment such as services/ai-service/.venv/; verify its presence and the service's setup instructions before assuming it exists.

Install dependencies using the project's declared dependency manager and lock or requirements files.

Keep runtime dependencies separate from development-only dependencies where supported.

Test dependency changes in a clean environment when practical.

Do not commit virtual environments, credentials, local model files, or generated caches.

Document external model providers and credentials required for integration tests.

6.4 Dependency security

For dependency changes:

Identify the vulnerable or incompatible dependency and affected component.

Confirm the affected version range from authoritative advisory information.

Prefer a maintained fixed release compatible with the application.

Review transitive dependency and lockfile changes.

Run the affected package's tests and build.

Run relevant vulnerability scanners.

Record any unresolved advisory, accepted risk, or compensating control.

Ensure CI uses maintained action versions and pinned or otherwise controlled build inputs consistent with repository policy.

A clean scan means that the executed scanner did not report findings under its configured database, rules, and scope. It is not proof that the system is free of vulnerabilities.

7. Testing Strategy and Quality Gates

Tests should establish observable behavior and important failure properties, not merely execute lines of code.

7.1 Test layers

Use the following layers where appropriate:

Unit tests: Pure logic, validation, state transitions, transformation, and deterministic error handling.

Component tests: A service's behavior with controlled dependencies.

API contract tests: Routes, GraphQL operations, request and response schemas, authorization, and compatibility.

Integration tests: Real interactions among the service and selected infrastructure dependencies.

End-to-end tests: Critical workflows across the actual application boundaries.

Security tests: Authentication, authorization, injection, input limits, tenant isolation, and abuse scenarios.

Performance tests: Explicit latency, throughput, concurrency, and resource targets.

Migration tests: Schema evolution, data preservation, and compatibility across deployment phases.

Choose the smallest test that provides convincing evidence for the acceptance criteria. Add broader coverage where integration boundaries create additional risk.

7.2 Required test design considerations

For behavior that can fail, consider:

Valid input and expected output.

Missing, malformed, oversized, or unexpected input.

Unauthenticated and unauthorized requests.

Duplicate requests and repeated events.

Concurrent operations and race conditions.

Database or network failure.

Dependency timeout and cancellation.

Partial completion and retry.

Empty result sets and pagination boundaries.

Resource cleanup and connection lifecycle.

Backward compatibility with existing clients.

Not every test suite needs every case. Select cases according to the change's actual failure modes and explain important exclusions.

7.3 Discover actual scripts

Do not assume the repository has a particular root script merely because a similar project would normally provide one.

Inspect the root and service manifests:

node -e 'console.log(JSON.stringify(require("./package.json").scripts, null, 2))'
node -e 'console.log(JSON.stringify(require("./services/express-api/package.json").scripts, null, 2))'
node -e 'console.log(JSON.stringify(require("./services/nest-api/package.json").scripts, null, 2))'

Use the scripts that actually exist. If a command fails because a script is undefined, report that fact and use the documented package-level workflow rather than inventing a passing result.

7.4 Integration prerequisites

Integration tests may require Docker, databases, Redis, message brokers, external model providers, environment variables, or explicit test configuration.

Before running them:

Identify the required dependencies.

Use isolated test databases and test credentials.

Avoid pointing destructive tests at development or production data.

Confirm the test service connects to the intended dependency endpoints.

Clean up temporary containers, networks, data, and processes.

Preserve diagnostic logs when failures occur.

A test that was skipped, could not start, or ran only against mocks must not be described as a completed live integration test.

7.5 Root-level configuration validation

For changes affecting Compose configuration:

docker compose config --quiet

For any change:

git diff --check

These checks cover configuration parsing and whitespace/conflict-marker issues respectively; neither substitutes for service tests or a real deployment.

8. API and GraphQL Contract Engineering

Changes to HTTP routes, GraphQL operations, input types, output types, error formats, or authentication behavior can affect independent clients and services.

Before changing an interface:

Locate its implementation and any authoritative schema.

Identify all known consumers.

Inspect validation, authorization, serialization, and error handling.

Determine whether the change is additive, breaking, or behaviorally incompatible.

Add tests for the new behavior and relevant compatibility requirements.

Update API documentation and examples.

Coordinate any required client or deployment changes.

Prefer additive changes where practical. Removing or renaming a field, changing nullability, altering enum values, changing pagination semantics, or changing error behavior may be breaking even if the service still builds.

For GraphQL:

Review resolver authorization and data-access boundaries.

Validate arguments and avoid trusting client-supplied ownership identifiers.

Consider query complexity, pagination, resolver fan-out, and N+1 access patterns.

Avoid returning fields the caller is not authorized to see.

Do not enable production schema introspection solely to make ad hoc debugging easier; follow the repository's explicit security and tooling configuration.

Keep schema changes, resolver behavior, tests, and generated clients synchronized where applicable.

For HTTP APIs:

Validate content types and payload shape.

Define appropriate status codes and error response behavior.

Apply request-size and timeout limits at suitable layers.

Preserve authentication and authorization on new routes.

Ensure proxy and forwarded-header behavior matches the trusted deployment topology.

9. Real-Time Events and Distributed Processing

Real-time communication and asynchronous workflows introduce failure modes that do not appear in ordinary request-response code.

When changing event producers, consumers, call flows, or background jobs, document:

The event name and version, if versioned.

Required and optional fields.

Identity and authorization semantics.

Event ordering assumptions.

Delivery and acknowledgement behavior.

Duplicate-delivery handling.

Retry and dead-letter behavior, if implemented.

Timeout and cancellation behavior.

Correlation identifiers and observability.

Persistence and reconciliation behavior.

Compatibility between independently deployed producers and consumers.

Assume duplicate delivery is possible unless the actual transport and application design establish otherwise. Use idempotency keys, unique constraints, transactional outbox patterns, or deduplication where appropriate to the required guarantee.

Do not claim exactly-once processing based only on a successful publish or acknowledgement. Explain the actual guarantee and its failure windows.

For call-event integrations, verify the internal authentication mechanism, payload validation, event identity, participant authorization, state transitions, and behavior when a consumer is unavailable. Keep internal service credentials out of client-visible configuration and logs.

10. Database and Data-Integrity Changes

Database changes require special care because schema and application versions may coexist during deployment.

Before changing a schema or query:

Identify the owning service and source-of-truth schema.

Review indexes, constraints, nullability, uniqueness, and referential integrity.

Check whether existing data satisfies new assumptions.

Consider query plans and pagination behavior for potentially large tables.

Determine whether the change requires a migration or data backfill.

Test failure and recovery behavior.

Document data retention and deletion implications where relevant.

10.1 Migration strategy

Prefer expand–migrate–contract for changes that must remain compatible with rolling or staggered deployments:

Add backward-compatible schema elements.

Deploy code that can operate with the transitional schema.

Backfill or migrate existing data safely.

Verify data correctness and application compatibility.

Remove obsolete schema elements only after old consumers are no longer active.

A migration that is syntactically valid is not automatically safe to deploy. Consider lock duration, table size, transaction behavior, rollback feasibility, and mixed application versions.

Never run a destructive migration against production without explicit operational authorization and an appropriate backup and recovery plan.

10.2 ORM and generated schema artifacts

Where Prisma or another ORM is used:

Update the authoritative schema.

Generate required clients using the repository's declared workflow.

Review migration SQL and generated changes.

Test the affected service against the intended database version.

Keep schema, migration history, and application expectations consistent.

Do not manually edit generated client output when it can be reproduced from the schema and toolchain.

11. Security and Privacy Requirements

Security review is required for all meaningful changes, with depth proportional to the risk.

11.1 Identity and authorization

Authenticate requests at the appropriate boundary.

Authorize every sensitive operation using the authenticated principal and resource ownership or policy.

Do not treat possession of an object ID as permission to access it.

Enforce tenant isolation in queries, resolvers, background jobs, and event handlers.

Avoid relying on client-side checks for server-side access control.

Test unauthorized and cross-tenant access paths.

11.2 Input and resource safety

Consider:

SQL, NoSQL, shell, template, and GraphQL injection.

Server-side request forgery and unsafe URL fetching.

Path traversal and unsafe file operations.

Oversized payloads and decompression abuse.

Expensive queries, unbounded pagination, and denial of service.

ReDoS and CPU-intensive parsing.

Unsafe deserialization and untrusted file formats.

Rate limits, concurrency limits, and timeouts.

Dependency and supply-chain risks.

Use context-appropriate validation and parameterization. Escaping alone is not a substitute for a correct security boundary.

11.3 Secrets and configuration

Never commit real credentials, private keys, access tokens, or production connection strings.

Use environment variables or the approved secret-management mechanism for runtime secrets.

Validate required configuration during startup where practical.

Fail clearly when mandatory configuration is absent or invalid.

Keep example values unmistakably synthetic.

Avoid logging authorization headers, tokens, passwords, private user content, or sensitive provider responses.

Rotate any credential that has been exposed; removing it from the latest commit does not invalidate a leaked secret.

11.4 Web, gateway, and proxy security

When modifying browser-facing APIs or gateway configuration, review:

CORS origins and credential behavior.

Cookie flags and session lifecycle where cookies are used.

TLS termination and trusted proxy configuration.

Forwarded headers and client-IP interpretation.

Request size, timeout, and connection limits.

Security headers and cache behavior for sensitive responses.

Route exposure and internal-versus-public service boundaries.

Do not trust forwarded headers from arbitrary clients unless the deployment's trusted-proxy model makes them authoritative.

11.5 AI and retrieval security

For AI service, retrieval, or tool-execution changes, consider:

Prompt injection from user content and retrieved documents.

Authorization filtering before retrieved content reaches a model.

Data leakage across users or tenants.

Tool permissions and the distinction between proposed and executed actions.

Input and output size limits.

Provider retention and data-processing terms.

Untrusted model output and downstream command or HTML execution.

Secret exposure in prompts, logs, embeddings, and traces.

Cost limits, rate limits, timeouts, and cancellation.

Evaluation coverage for safety and task correctness.

Model-generated content is untrusted input. A model response must not bypass ordinary authorization, validation, or execution safeguards.

11.6 Vulnerability reporting

Follow the private reporting instructions in SECURITY.md. Do not disclose exploitable vulnerabilities publicly before following the repository's responsible-disclosure process.

12. Observability and Operational Readiness

A service should expose enough operational evidence to identify and diagnose failures without leaking sensitive data.

Where applicable, changes should preserve or improve:

Structured logs with stable field names.

Request, trace, job, or event correlation identifiers.

Error categories that distinguish validation, authorization, dependency, and internal failures.

Latency and error measurements.

Dependency health and readiness behavior.

Queue depth, retry counts, and processing failures for asynchronous work.

Safe startup diagnostics for missing configuration.

Graceful shutdown and cleanup behavior.

Health endpoints must reflect their documented purpose. Liveness should not necessarily fail merely because a temporary external dependency is unavailable; readiness should communicate whether the service can accept its intended workload.

Avoid logging secrets or full sensitive request bodies. Keep error messages useful to operators without exposing stack traces, internal addresses, credentials, or private data to untrusted clients.

Do not add metrics with unbounded label cardinality, such as arbitrary user IDs, request URLs containing identifiers, or raw exception text.

13. Performance and Capacity

Performance claims must be tied to a measurable workload and environment.

When performance matters, define:

Expected request or job volume.

Concurrency and payload-size assumptions.

Latency percentiles and throughput targets.

CPU, memory, connection-pool, and storage constraints.

Timeout and retry budgets.

Queue growth and backpressure behavior.

Cache consistency and invalidation requirements.

Avoid premature optimization, but investigate known high-cost paths such as repeated database lookups, N+1 resolver access, unbounded collections, synchronous blocking in asynchronous code, unnecessary serialization, and uncontrolled retries.

Do not describe a service as having no bottlenecks without measured evidence. Record benchmark methodology, environment, workload, and results when making quantitative claims.

14. Configuration and Environment Management

Configuration should be explicit, documented, validated, and consistent across development, CI, and deployment.

When adding or changing an environment variable, document:

Exact variable name.

Owning service.

Whether it is required or optional.

Expected format and accepted values.

Default behavior, if one actually exists.

Whether it contains a secret.

Which environments require it.

Startup and runtime behavior when it is invalid or missing.

Keep example configuration aligned with actual configuration parsing. Do not document a default that the implementation does not provide.

Review environment variables, ports, service names, health checks, volumes, networks, and dependency ordering together when modifying Compose or deployment configuration.

15. Docker, Compose, and Build Reproducibility

Container changes can fail even when application code works locally.

Review:

Docker build context and all referenced COPY paths.

Workspace manifests and lockfiles required for dependency installation.

Build-time versus runtime dependencies.

Correct working directory and package selection.

Runtime user and filesystem permissions.

Exposed and published ports.

Health checks and startup dependencies.

Secret injection and environment configuration.

Signal handling and graceful process shutdown.

Image size and unnecessary build artifacts.

Dependency and base-image maintenance.

For workspace-based builds, verify that the build context includes every manifest required by the package manager. A Dockerfile that copies a package manifest from outside its context cannot work reliably.

Compose service names used for internal communication must match the configured network and upstream hostnames. A host-published port and a container's internal port are different concepts; document each accurately.

Validate Compose changes with:

docker compose config --quiet

Where practical, build the changed image and run the relevant test against the resulting image. A successful configuration parse alone does not prove that an image builds or starts.

16. CI/CD and Release Engineering

CI should provide reproducible, actionable evidence for changes and should fail clearly when required validation fails.

When changing the Jenkins pipeline, GitHub Actions, Docker CI definitions, or dependency automation, review:

Trigger conditions and branch behavior.

Dependency installation and lockfile enforcement.

Build context and artifact consistency.

Test command accuracy.

Required infrastructure and service readiness.

Isolation between concurrent builds.

Unique container and network names.

Cleanup on success, failure, and cancellation.

Secret handling and permissions.

Cache correctness and invalidation.

Exit-code propagation and failure diagnostics.

Image provenance and dependency scanning where configured.

Integration environments should not share mutable test databases or service instances across concurrent builds unless isolation is explicitly provided.

A test container must actually execute the intended test command. Starting an application container is not equivalent to running its test suite.

For release and migration workflows, define ordering, compatibility assumptions, health verification, failure response, and rollback or roll-forward procedures.

Never claim a CI pipeline is validated solely because the Jenkinsfile or workflow file parses as text. Use the available linter, pipeline validation, or an actual build where supported, and record limitations.

17. API Compatibility and Deployment Safety

For changes spanning independently started or deployed components, assume versions may temporarily differ.

Prefer a rollout sequence that preserves compatibility:

Deploy compatible server or schema changes.

Verify the new capability.

Update consumers.

Monitor adoption and errors.

Remove deprecated behavior only when no active consumer requires it.

If that sequence is not applicable, document the actual deployment ordering and why it is safe.

Configuration, DNS/service discovery, internal authentication, and network policy are part of the runtime contract. Updating application code without updating its required deployment configuration is an incomplete change.

18. Documentation Standards

Documentation is a maintained engineering artifact, not a substitute for implementation or test evidence.

Update relevant documents when changing:

Component ownership or architecture.

Public or internal APIs.

Event schemas or delivery guarantees.

Environment variables and secrets.

Database schemas and migrations.

Build or test commands.

Deployment topology or service discovery.

Security boundaries.

Operational procedures or failure recovery.

18.1 Documentation quality

Prefer:

Exact repository paths and command names.

Explicit prerequisites and expected outcomes.

Concrete examples using synthetic values.

Clear separation between required and optional settings.

Stated limitations and known failure modes.

Links to authoritative schemas and implementation files.

Diagrams that match actual runtime boundaries.

Decision records that explain context, alternatives, consequences, and status.

Avoid:

Unsupported claims such as "production-ready," "fully secure," or "zero bottlenecks."

Commands that reference nonexistent scripts or removed directories.

Placeholder instructions presented as executable procedures.

Duplicated documentation that can drift independently.

Unverified ports, service names, defaults, or deployment assumptions.

Describing intended future work as implemented behavior.

When a fact has not been verified, label it as unverified or omit it until confirmed.

19. Code Comments and Design Decisions

Comments should explain intent, invariants, non-obvious constraints, and reasons for decisions.

Good comments explain why an operation must occur in a particular order, why a retry is safe, why a seemingly redundant authorization check is required, or why a compatibility constraint exists.

Avoid comments that simply restate the next line of code.

For substantial architectural decisions, add or update an appropriate record under docs/decisions/. A useful decision record includes:

Title and status.

Context and constraints.

The decision made.

Alternatives considered.

Security and operational consequences.

Migration and compatibility implications.

Evidence and follow-up work.

Conditions that would justify revisiting the decision.

Decision records describe why the design exists; they do not override contradictory implementation evidence.

20. Git and Change Hygiene

Before committing:

git status --short
git diff --check
git diff --stat
git diff

Keep commits focused and explain the intent in their messages.

Do not include local secrets, .env files, virtual environments, dependency caches, build output, or unrelated generated files.

Do not commit temporary test databases or personal machine configuration.

Preserve unrelated user changes.

Review lockfile changes for unexpected dependency churn.

Ensure deletions and renames are intentional and reflected in documentation.

Do not amend, reset, rebase, or force-push shared history without the appropriate authorization and coordination.

Use the repository's established commit conventions where available. A conventional commit format may be used when consistent with the project's practice, for example:

fix(express-api): validate internal call-event payloads
test(nest-api): cover task authorization failures
docs(architecture): clarify service ownership boundaries

These examples illustrate format only; choose a scope and type that accurately represent the actual change.

21. Pull Request Requirements

A pull request should make it possible for reviewers to understand the change, its risk, and the evidence supporting it.

Include:

A concise problem statement and intended outcome.

The affected applications, services, interfaces, and data stores.

A description of the design and important trade-offs.

Compatibility and deployment implications.

Schema migration and rollback or roll-forward considerations.

Security and privacy considerations.

Tests executed and their actual outcomes.

Build, lint, scan, and integration results where relevant.

Screenshots or recordings for meaningful UI changes.

Configuration and documentation updates.

Explicit known limitations and follow-up work.

21.1 Review checklist

The change has a clear owner and bounded scope.

Existing behavior and downstream consumers were considered.

Input validation and authorization are enforced at the correct boundary.

Failure paths and resource cleanup are handled.

Database changes preserve integrity and deployment compatibility.

API and event contracts are documented and tested.

Secrets and sensitive data are protected.

Logging and operational diagnostics are appropriate.

Relevant tests and builds were actually run.

CI, Docker, Compose, and deployment references remain consistent.

Dependency and security implications were reviewed.

Documentation reflects the resulting implementation.

git diff --check passes.

Remaining risks and unexecuted checks are disclosed.

22. Definition of Done

A contribution is ready for merge when all applicable conditions are satisfied:

Acceptance criteria are met.

The implementation follows the owning component's established boundaries.

Public and internal contracts remain compatible or are intentionally migrated.

Relevant tests pass, or any unavailable checks are explicitly reported and accepted by the responsible reviewers.

Required linting, type checks, and builds have been completed.

Security, authorization, and data-integrity implications have been reviewed.

Configuration and deployment changes are complete.

Documentation and operational instructions match the implementation.

The diff contains no accidental changes or exposed secrets.

Review feedback has been addressed.

Remaining limitations and operational risks are visible to the team.

The definition of done is evidence-based. A checklist must not be marked complete solely because a command was intended to run.

23. Engineering Escalation and Risk Management

Escalate before merging when a change introduces or materially alters:

A public API or authentication contract.

Cross-tenant data access or sensitive data handling.

A destructive or difficult-to-reverse migration.

A new trust boundary or internal service credential.

A new external provider or critical runtime dependency.

Event delivery guarantees or distributed consistency assumptions.

Production routing, gateway, proxy, or network policy.

A security advisory with no clear remediation.

An unverified deployment or rollback procedure.

A major dependency or toolchain upgrade affecting multiple services.

The purpose of escalation is to resolve uncertainty before it becomes an operational incident. Record the decision, owner, accepted risk, and follow-up where appropriate.

24. Final Engineering Standard

Relay contributions should leave the repository easier to understand, test, secure, operate, and extend.

Prefer demonstrable correctness over optimistic claims, explicit contracts over hidden coupling, reproducible procedures over tribal knowledge, and measured evidence over assumptions.

The expected result is not documentation that merely looks polished. It is documentation that engineers can execute, reviewers can verify, and operators can trust.
