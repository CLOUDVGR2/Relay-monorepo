# Relay System Architecture

**Document type:** System architecture and engineering reference
**Audience:** Principal and staff engineers, technical leads, security reviewers, SREs, contributors, and engineering leadership
**Canonical local orchestration:** `compose.yaml`
**Architecture decision records:** `docs/decisions/`
**Status:** Repository-grounded architecture description; production guarantees require separate operational evidence

---

## 1. Executive Architecture Summary

Relay is a polyglot application platform organized as a monorepo. It combines browser and mobile clients, API services, a Go gateway, asynchronous job processing, an AI service, persistent data stores, and deployment infrastructure.

The architecture separates user interaction, application interfaces, background execution, and specialized AI workflows into distinct components. This separation creates useful ownership boundaries, but it also introduces distributed-systems concerns: network failures, authorization propagation, data consistency, service-version compatibility, asynchronous delivery, configuration drift, and operational diagnosis.

The principal components are:

| Component | Canonical path | Primary architectural role |
|---|---|---|
| Web application | `apps/web/` | Browser-facing experience |
| Mobile application | `apps/mobile/` | Native mobile experience |
| Express API | `services/express-api/` | Express HTTP endpoints and real-time communication |
| NestJS API | `services/nest-api/` | NestJS application APIs, GraphQL, and Prisma-backed data access |
| API gateway | `services/api-gateway/` | Go-based HTTP gateway and configured upstream routing |
| Jobs API | `services/jobs-api/` | Go-based job operations |
| Jobs worker | `services/jobs-worker/` | Asynchronous job execution |
| AI service | `services/ai-service/` | Python AI, retrieval, and model-provider workflows |
| Local orchestration | `compose.yaml` | Developer-facing multi-container configuration |
| Deployment assets | `infrastructure/` | CI/CD support and deployment configuration |
| Architecture documentation | `docs/` | Decisions, operating guidance, and implementation documentation |

The repository also contains JavaScript workspace configuration, Go modules, Python dependencies, service-specific schemas, and test suites. Their exact boundaries must be verified against their manifests and implementation.

### 1.1 Architecture goals

The architecture should support:

- Clear ownership of APIs, data, and background processing.
- Explicit and testable interfaces between services.
- Authentication and authorization at the appropriate trust boundaries.
- Controlled dependency failures and bounded resource consumption.
- Reproducible builds and environment-specific configuration.
- Safe database and API evolution.
- Observable behavior across synchronous and asynchronous workflows.
- Independent testing of components and meaningful integration testing.
- Maintainable documentation tied to implementation evidence.

These are architectural goals and review criteria, not blanket assertions that every property is already implemented or production-verified.

---

## 2. Evidence Model and Architectural Confidence

Architecture documentation must distinguish what exists from what has been proven to work.

| Evidence level | Meaning | Appropriate evidence |
|---|---|---|
| Repository fact | A file, module, schema, or component exists | Source tree and version-controlled configuration |
| Declared configuration | A route, dependency, port, or environment variable is configured | Compose files, manifests, Dockerfiles, source configuration |
| Implemented behavior | Executable code performs the described operation | Implementation and relevant tests |
| Verified behavior | A reproducible test or scenario passed | Command, environment, commit, and observed result |
| Operational guarantee | A property is maintained under defined conditions | Design, tests, production configuration, monitoring, and recovery evidence |

For example, declaring a RabbitMQ dependency does not prove durable job completion. Configuring an upstream URL does not prove that the gateway exposes every route on that upstream. A Kubernetes manifest does not prove that a cluster has been deployed successfully.

Throughout this document:

- **Implemented component** describes a component present in the repository.
- **Configured integration** describes a relationship declared by source or configuration.
- **Required invariant** describes a property the implementation must preserve.
- **Verification required** identifies behavior that must be confirmed before it is represented as an operational guarantee.

---

## 3. Canonical Repository Topology

```text
Relay-monorepo/
├── apps/
│   ├── web/                       # Browser application
│   └── mobile/                    # Native mobile application
├── services/
│   ├── api-gateway/               # Go gateway
│   ├── express-api/               # Canonical Express API
│   ├── nest-api/                  # NestJS / GraphQL API
│   ├── jobs-api/                  # Go jobs API
│   ├── jobs-worker/               # Go asynchronous worker
│   └── ai-service/                # Python AI / retrieval service
├── infrastructure/
│   ├── devops/                    # CI and development infrastructure
│   ├── deploy/                    # Deployment assets, where present
│   └── kubernetes/                # Kubernetes/Kustomize resources, where present
├── docs/
│   ├── decisions/                 # Architecture decision records
│   ├── architecture.md
│   ├── implementation-status.md
│   └── repository-layout.md
├── tests/                         # Repository-level tests, where present
├── compose.yaml                   # Canonical local Compose entry point
├── Jenkinsfile                    # Jenkins pipeline definition
├── package.json                   # Root package metadata and scripts
├── pnpm-workspace.yaml            # JavaScript workspace configuration
└── pnpm-lock.yaml                 # JavaScript dependency lockfile

The tree is a conceptual map, not an exhaustive inventory of every file. Confirm the current working tree before adding new paths or claiming that a particular deployment asset exists.

3.1 Canonical implementation rules

services/express-api/ is the current canonical Express implementation.

archive/express-api-legacy/ is not part of the current canonical runtime structure.

compose.yaml at the repository root is the canonical local Compose entry point.

Each service owns its implementation and service-specific configuration unless an explicit shared contract says otherwise.

Root workspace configuration does not imply that all services share one runtime, one database, or one deployment lifecycle.

A service directory does not, by itself, establish independent production deployability.

Do not create duplicate service implementations to work around an unclear ownership boundary. Resolve the boundary and update the relevant architecture decision record.

4. System Context: A–Z Architecture Diagram

This is the high-level map of the major actors, services, and stateful dependencies. Arrows represent logical relationships that must be confirmed against actual route tables, runtime configuration, and tests before being treated as verified end-to-end paths.

flowchart TB
    User["A. User / Operator"]
    Web["B. Web Client<br/>apps/web"]
    Mobile["C. Mobile Client<br/>apps/mobile"]

    Gateway["D. Go API Gateway<br/>services/api-gateway"]
    Express["E. Express API<br/>HTTP + Socket.IO"]
    Nest["F. NestJS API<br/>GraphQL + application APIs"]

    JobsAPI["G. Go Jobs API"]
    Worker["H. Go Jobs Worker"]
    AI["I. Python AI Service<br/>FastAPI / AI workflows"]

    Mongo[("J. MongoDB")]
    PostgreSQL[("K. PostgreSQL")]
    Redis[("L. Redis")]
    RabbitMQ[("M. RabbitMQ")]

    Config["N. Environment Configuration<br/>and Service Discovery"]
    CI["O. CI/CD<br/>Jenkins and repository automation"]
    Images["P. Container Images"]
    Deploy["Q. Deployment Assets<br/>Compose / Kubernetes"]

    Telemetry["R. Logs, Metrics, Traces<br/>where configured"]
    Secrets["S. Secret Management<br/>deployment-specific"]
    Tests["T. Unit, Contract, Integration<br/>and End-to-End Tests"]

    User --> Web
    User --> Mobile

    Web -->|"Configured client API calls"| Express
    Web -->|"Configured GraphQL/API calls"| Nest
    Mobile -->|"Native HTTP / real-time contracts"| Express

    Web -. "If configured for this route" .-> Gateway
    Mobile -. "If configured for this route" .-> Gateway

    Gateway -->|"Implemented routes only"| Express
    Gateway -->|"Implemented routes only"| Nest
    Gateway -. "Verify route exposure" .-> JobsAPI
    Gateway -. "Verify route exposure" .-> AI

    Express --> Mongo
    Express --> Redis
    Express -. "Configured internal integration" .-> AI

    Nest --> PostgreSQL
    Nest -. "Additional dependencies: verify" .-> Redis

    JobsAPI --> RabbitMQ
    JobsAPI --> Redis
    RabbitMQ --> Worker
    Worker --> Redis

    AI --> PostgreSQL

    Config -.-> Gateway
    Config -.-> Express
    Config -.-> Nest
    Config -.-> JobsAPI
    Config -.-> Worker
    Config -.-> AI

    CI --> Tests
    CI --> Images
    Images --> Deploy
    Secrets -. "Injected at runtime" .-> Deploy

    Gateway -.-> Telemetry
    Express -.-> Telemetry
    Nest -.-> Telemetry
    JobsAPI -.-> Telemetry
    Worker -.-> Telemetry
    AI -.-> Telemetry

4.1 Diagram interpretation

The letter labels provide a navigation aid, not execution order.

Solid edges indicate principal logical relationships represented by the architecture. Dashed edges identify configuration-dependent or deployment-dependent relationships that require specific verification.

In particular:

Confirm whether web and mobile traffic reaches the gateway or calls services directly in each environment.

Confirm which upstream paths the gateway actually implements.

Confirm which database schemas each service owns and accesses.

Confirm which telemetry exporters and secret-management integrations are deployed.

Confirm that Compose and Kubernetes use compatible service identities, ports, environment variables, and health checks.

Do not infer that a dashed relationship is active merely because its endpoints exist.

5. Runtime and Trust Boundaries

The architecture has several distinct trust boundaries.

5.1 Client boundary

The browser and mobile application execute in environments controlled by their users. Client-side validation improves usability but does not authorize access to server-side resources.

All client-supplied identifiers, claims, request bodies, query parameters, socket messages, and cached state must be treated as untrusted until validated and authorized by the receiving service.

Frontend build-time configuration is public. Values embedded in browser assets must never contain server credentials or private signing keys.

5.2 Gateway boundary

The gateway can centralize routing and selected HTTP behavior. It is not automatically the only network path into backend services.

Backend authorization must remain correct even when a request bypasses the gateway, reaches an internal service directly, or originates from another service.

Proxy headers and client identity are trustworthy only under an explicitly configured trusted-proxy model.

5.3 Service boundary

Every service must validate its own inputs and enforce authorization for the operations and resources it owns.

Internal network reachability is not equivalent to authentication. Service-to-service credentials must be scoped, protected, rotated, and excluded from client-visible responses and logs.

5.4 Data boundary

A database connection does not imply permission to access every record or schema in the database. Queries must enforce the appropriate resource ownership, tenant, and authorization conditions.

5.5 Asynchronous boundary

Queue messages are untrusted input even when they originate from internal producers. Consumers must validate payloads, handle duplicates, bound resource consumption, and enforce the permissions required for their side effects.

5.6 AI boundary

Retrieved content, model output, user prompts, tool results, and external-provider responses have different trust levels. AI-generated text must not override application authorization or be executed as trusted code.

6. End-to-End Request Lifecycle: A–Z

The following diagram describes a reference request lifecycle. It is a reasoning model for tracing an operation, not a claim that every request traverses every stage.

flowchart TD
    A["A. User initiates an action"]
    B["B. Client validates presentation state"]
    C["C. Client selects the configured endpoint"]
    D["D. DNS / service discovery resolves destination"]
    E["E. Network and TLS boundary"]
    F["F. Gateway routing, if used"]
    G["G. Backend request parsing"]
    H["H. Authentication"]
    I["I. Authorization and resource ownership"]
    J["J. Input validation and normalization"]
    K["K. Application / domain logic"]
    L["L. Data access or downstream operation"]
    M["M. Transaction / persistence boundary"]
    N["N. Event or job publication, if needed"]
    O["O. Result or failure classification"]
    P["P. Response serialization"]
    Q["Q. HTTP / GraphQL response or socket event"]
    R["R. Client state update"]
    S["S. User-visible outcome"]
    T["T. Correlation and structured logging"]
    U["U. Metrics and tracing, where configured"]
    V["V. Retry / reconciliation, where appropriate"]
    W["W. Operational alerting, where configured"]
    X["X. Incident diagnosis"]
    Y["Y. Recovery or compensating action"]
    Z["Z. Regression test and documentation update"]

    A --> B --> C --> D --> E
    E --> F
    F --> G
    E -. "Direct service path, if configured" .-> G
    G --> H --> I --> J --> K --> L --> M
    M --> N
    M --> O
    N --> O
    O --> P --> Q --> R --> S

    G -.-> T
    H -.-> T
    K -.-> T
    L -.-> T
    N -.-> U
    O -.-> U
    U -.-> W
    W -.-> X
    X --> Y --> Z
    V -. "Only for classified retryable failures" .-> L

6.1 Required invariants across the request path

For each critical operation, identify the following:

Concern

Required question

Identity

How is the caller authenticated?

Authorization

Which policy authorizes this exact action on this resource?

Validation

Where are input shape, size, and semantic constraints enforced?

Ownership

Which service and datastore own the affected record?

Consistency

Which writes must succeed or fail together?

Idempotency

What happens if the client or transport repeats the request?

Timeouts

What is the maximum time spent in each downstream dependency?

Failure

How are errors classified and exposed safely?

Observability

Which request, trace, or operation ID connects the logs?

Recovery

Can the operation be retried, reconciled, compensated, or safely abandoned?

A failure in one stage must not silently bypass the security or consistency requirements of another stage.

6.2 Synchronous response versus asynchronous completion

Accepting a request to create work is not the same as completing that work.

Where an API initiates asynchronous processing, its contract should explicitly distinguish:

Request accepted.

Job or operation identifier issued.

Work queued.

Work started.

Work completed.

Work failed or cancelled.

Status unavailable or outcome uncertain.

The actual state names and transition rules must come from the implementation. Do not publish a generic lifecycle as though it were the application's exact enum.

7. Service Architecture and Responsibilities

7.1 Web application — apps/web/

Primary role: Browser-facing user experience.

The web client owns presentation, interaction state, navigation, and calls to server-side APIs. It must not become the authority for identity, permissions, tenant isolation, or durable business state.

Architecture review areas:

API endpoint configuration and proxy behavior.

Authentication and session-expiration behavior.

Loading, empty, error, and partial-result states.

Socket reconnection and duplicate-event handling.

Accessible interaction and keyboard behavior.

Client-side cache invalidation and stale state.

Avoidance of secret leakage into built assets.

Safe rendering of untrusted content.

Bundle size and browser resource consumption.

Validation: Use the actual web package scripts, production build, relevant component tests, and end-to-end checks for critical flows where available.

7.2 Mobile application — apps/mobile/

Primary role: Native mobile user experience.

The mobile app has a distinct runtime and credential-handling model from the browser. Native authentication, secure token storage, request cancellation, background/foreground transitions, connectivity changes, and platform permissions require explicit treatment.

The repository's documented mobile implementation includes authentication, contact/presence browsing, text messaging, and AI answers/citations. Do not assume parity with every web workflow.

Architecture review areas:

Native login and signup contract.

Bearer-token lifecycle and secure storage.

Logout and token invalidation.

Socket authentication and reconnect behavior.

Network interruption and app lifecycle transitions.

Pagination, cancellation, and memory budgets.

Platform-specific permissions and release configuration.

Compatibility with backend error and response contracts.

See docs/mobile-architecture.md if present; verify its path and current contents before treating it as authoritative.

7.3 Express API — services/express-api/

Primary role: Express-based HTTP APIs and real-time communication.

The service uses a Node.js/Express architecture with Socket.IO and repository-declared persistence and integration dependencies.

The repository describes responsibilities involving authentication, messaging, incident and AI-related routes, MongoDB-backed models, Redis integration, and internal AI-service calls. The precise active route list must be derived from the current router registrations and middleware.

Architecture review areas:

Middleware ordering and centralized error handling.

Authentication and per-resource authorization.

Socket connection authentication, room membership, and event authorization.

MongoDB query scoping, indexing, and data validation.

Redis usage, expiry, and failure behavior.

Rate limiting and request-size limits.

Internal AI-service authentication and timeouts.

Health and readiness semantics.

Graceful shutdown of HTTP and socket connections.

Consistency between runtime configuration, Compose, and CI.

HTTP authorization does not automatically secure Socket.IO events. Validate identity and permission at the appropriate connection and event boundaries.

7.4 NestJS API — services/nest-api/

Primary role: NestJS application APIs, GraphQL operations, and Prisma-backed data access.

The service contains NestJS and GraphQL/Apollo integration and a Prisma schema/client workflow. Additional integrations must be verified against the current modules and configuration.

Architecture review areas:

Resolver and service authorization.

Validation and transformation boundaries.

Resource ownership and tenant scoping.

GraphQL pagination, query complexity, and resolver fan-out.

Data-access efficiency and N+1 patterns.

Prisma schema and migration consistency.

GraphQL error behavior and information disclosure.

Configuration validation and startup behavior.

Compatibility between schema changes and deployed clients.

A hidden GraphQL field or a frontend route guard is not an authorization control. Protect the actual operation and resource.

7.5 Go API gateway — services/api-gateway/

Primary role: HTTP routing and gateway behavior implemented in Go.

The gateway's responsibility is defined by its actual route table, middleware, reverse-proxy configuration, and deployment environment.

Architecture review areas:

Explicit route matching and path-prefix handling.

Header and query-string forwarding.

Request-body and response-stream behavior.

Upstream timeout and connection behavior.

Error mapping and safe error responses.

Trusted-proxy handling.

Health and readiness behavior.

Graceful shutdown.

Consistency between Compose upstream URLs and runtime DNS.

Authentication and authorization boundaries for each exposed route.

An upstream URL in configuration does not establish that every route on the upstream is accessible through the gateway. Test the exact public paths.

7.6 Go jobs API — services/jobs-api/

Primary role: HTTP-facing job operations.

The service is a Go module with repository-declared HTTP and messaging integrations. Inspect the actual handlers and schemas to establish the supported job types, request contract, and state machine.

Architecture review areas:

Request authentication and authorization.

Input validation and bounded payloads.

Job identifier generation and uniqueness.

Publication failure and uncertain-outcome behavior.

Status transitions and state persistence.

Queue confirmation and retry semantics.

Idempotency for duplicate submission.

Timeouts and dependency connection lifecycle.

Health/readiness distinction.

Compatibility with the worker's message schema.

The API must distinguish a job accepted for processing from one that has completed its business effect.

7.7 Go jobs worker — services/jobs-worker/

Primary role: Asynchronous execution of queued work.

The worker's implementation, message handler registry, broker configuration, acknowledgement logic, retry strategy, and status persistence define its actual behavior.

Review at least:

Message schema validation and versioning.

Acknowledgement timing.

Redelivery and duplicate delivery.

Retryable versus terminal failures.

Backoff, retry limits, and dead-letter handling.

Idempotency keys and expiry.

Side effects occurring before acknowledgement.

Worker shutdown with in-flight work.

Broker restart and reconnect behavior.

Queue depth and oldest-message age.

Poison-message handling.

Reconciliation after partial completion.

Do not claim exactly-once execution based on RabbitMQ, Redis, a status record, or an idempotency key alone. State the real delivery guarantee and its failure windows.

7.8 Python AI service — services/ai-service/

Primary role: AI-related HTTP workflows, retrieval, and model-provider integration.

The repository declares a Python/FastAPI stack with SQLAlchemy async, Alembic, asyncpg, pgvector, LangGraph, LiteLLM, and MCP-related dependencies. The presence of a library does not establish that every workflow uses it.

Architecture review areas:

HTTP input validation and authentication.

Internal service authentication.

Model-provider selection and configuration.

Prompt and model versioning.

Retrieval filters and document authorization.

Embedding and vector-index compatibility.

Chunking and context-size limits.

Provider timeout, cancellation, and rate limiting.

Tool execution permissions.

Prompt injection and untrusted retrieved content.

Database migrations and index maintenance.

Sensitive-data redaction.

Cost controls and concurrency limits.

Evaluation of answer quality and citation correctness.

Authorization must constrain retrieval before sensitive content reaches a model. Model output remains untrusted and must not bypass ordinary application controls.

7.9 Shared infrastructure dependencies

The repository's architecture includes MongoDB, PostgreSQL, Redis, and RabbitMQ. Their exact production configuration and ownership policies require environment-specific verification.

Dependency

Architectural use

Questions that must be answered

MongoDB

Express persistence

Which collections are authoritative? How are indexes, validation, backup, and restore managed?

PostgreSQL

Relational and AI-related persistence

Which service owns each schema? Who owns migrations, indexes, retention, and recovery?

Redis

Cache, rate limiting, coordination, and selected job state

Which keys are disposable? What TTL and eviction behavior applies? What happens during loss or restart?

RabbitMQ

Asynchronous message transport

What are the acknowledgement, persistence, retry, dead-letter, and redelivery guarantees?

Shared infrastructure does not imply shared data ownership. Each durable entity should have an explicit authoritative writer and a defined contract for other services.

8. Synchronous API and Real-Time Communication

8.1 HTTP and GraphQL

For each API operation, define:

Method and path or GraphQL operation.

Authentication mechanism.

Authorization policy.

Input schema and size limits.

Response schema and error mapping.

Pagination and ordering semantics.

Timeout and cancellation behavior.

Idempotency behavior where applicable.

Observability and correlation identifiers.

Maintain contract tests for important boundaries, particularly when a web or mobile client consumes a service independently.

8.2 Socket.IO

Real-time flows add lifecycle and ordering concerns beyond ordinary HTTP.

Document and test:

Authentication during connection establishment.

Reauthentication or token-expiration behavior, where applicable.

Room membership and resource-level access.

Event schema and versioning.

Duplicate or out-of-order event handling.

Reconnection and resubscription behavior.

Disconnect cleanup and stale membership.

Authorization for each sensitive event.

Delivery acknowledgement and retry behavior, if implemented.

A successful socket connection does not authorize every subsequent event. Membership and permissions must be enforced for the resources involved.

8.3 Error propagation

Errors should be classified by cause and mapped to a stable client-facing contract.

Distinguish at minimum where relevant:

Invalid input.

Authentication failure.

Authorization failure.

Missing resource.

Conflict or invalid state transition.

Rate limiting.

Dependency unavailable.

Dependency timeout.

Unexpected internal failure.

Do not return stack traces, internal credentials, raw database errors, or provider secrets to untrusted clients.

9. Asynchronous Job Lifecycle

The following diagram describes a reference lifecycle for queue-backed work. The exact state names, transitions, persistence locations, and acknowledgement behavior must be confirmed against the current jobs API and worker implementation.

sequenceDiagram
    autonumber
    participant C as Client / Caller
    participant A as Jobs API
    participant R as Redis / Status Store
    participant Q as RabbitMQ
    participant W as Jobs Worker
    participant D as Downstream Dependency

    C->>A: Submit validated job
    A->>A: Authenticate and authorize
    A->>A: Validate request and idempotency key

    opt Status or deduplication record is implemented
        A->>R: Record accepted state / idempotency
        R-->>A: Result
    end

    A->>Q: Publish job message
    Q-->>A: Publish outcome, if confirmation is supported
    A-->>C: Accepted response or classified failure

    Q->>W: Deliver message
    W->>W: Validate schema and classify delivery

    opt Job requires a downstream operation
        W->>D: Execute bounded operation
        D-->>W: Result or failure
    end

    opt Status persistence is implemented
        W->>R: Record terminal or retryable state
        R-->>W: Persistence outcome
    end

    alt Successful processing
        W->>Q: Acknowledge at the defined commit point
    else Retryable failure
        W->>Q: Retry or requeue according to policy
    else Terminal failure
        W->>Q: Reject / dead-letter according to policy
    end

9.1 Critical consistency window

A distributed job submission may involve several separate operations:

Writing an idempotency or status record.

Publishing a message.

Receiving a broker confirmation.

Returning an HTTP response.

These operations are not automatically atomic.

For example, if a status write succeeds and publication fails, the system may retain a record for work that was never queued. If publication succeeds but the caller loses the response, the caller may retry and create duplicate work.

Possible designs include transactional outbox, broker publisher confirms, unique idempotency records, reconciliation, and explicit uncertain states. Choose based on the actual datastore, transport, and business requirements; do not claim that any pattern is implemented until the code and tests establish it.

9.2 Required worker guarantees

The worker must define:

The point at which a message is considered processed.

Whether failed messages are redelivered.

How duplicate side effects are prevented.

Which errors are retryable.

Maximum attempts and backoff.

Poison-message handling.

Status persistence failure behavior.

Recovery after process or dependency restart.

How operators identify stuck, abandoned, or repeatedly failing jobs.

Do not acknowledge work before the required side effects are safely complete unless the design explicitly uses another durable recovery mechanism.

10. AI and Retrieval-Augmented Generation Lifecycle

The AI service may combine request handling, document ingestion, vector retrieval, model inference, and optional tool execution. Each path should be documented and tested separately.

flowchart TD
    A["A. Authenticated request or ingestion trigger"]
    B["B. Validate identity, payload, and size"]
    C["C. Resolve tenant and resource permissions"]
    D["D. Normalize and process input"]
    E["E. Extract text / prepare chunks, if ingestion"]
    F["F. Generate embeddings, if configured"]
    G["G. Persist document and index data"]
    H["H. Retrieve authorized context"]
    I["I. Build bounded model request"]
    J["J. Invoke configured model provider"]
    K["K. Validate model response"]
    L["L. Validate tool request, if applicable"]
    M["M. Execute permitted tool operation"]
    N["N. Assemble answer and citations"]
    O["O. Apply response policy and serialization"]
    P["P. Return result"]
    Q["Q. Record safe diagnostics and evaluation data"]

    A --> B --> C --> D
    D --> E --> F --> G
    D --> H
    G -. "Index becomes available after successful persistence" .-> H
    H --> I --> J --> K
    K --> L
    L --> M --> I
    K --> N
    M --> N
    N --> O --> P
    B -.-> Q
    G -.-> Q
    J -.-> Q
    O -.-> Q

10.1 Retrieval and authorization

The exact ingestion and retrieval stages depend on the implemented workflow. For each pipeline, establish:

Supported input formats and file-size limits.

Text extraction and malformed-file behavior.

Chunking and overlap policy.

Embedding model and dimensions.

Vector schema and index configuration.

Metadata and tenant filters.

Document deletion and index cleanup.

Re-indexing and model-version migration.

Retrieval scoring and candidate limits.

Citation provenance and validation.

Apply document authorization before context is supplied to the model. A final answer filter alone cannot prevent sensitive content from being exposed to the provider.

10.2 Model-provider controls

Bound request and response sizes.

Set explicit timeouts and cancellation behavior.

Limit provider concurrency and retries.

Classify provider errors and rate limits.

Track model and prompt configuration for reproducibility.

Redact secrets and sensitive content from logs.

Validate structured output before downstream use.

Treat model-proposed tool calls as requests requiring independent policy enforcement.

Measure answer quality and citation correctness using explicit evaluations.

The presence of LangGraph, LiteLLM, pgvector, or MCP dependencies does not establish which features are active or what guarantees they provide in a specific workflow.

11. Data Ownership and Consistency

11.1 Ownership model

For every durable entity, document:

Owning service.

Authoritative datastore and schema.

Authorized write paths.

Read paths and projections.

Unique identifiers and constraints.

Transaction boundaries.

Migration owner.

Retention and deletion policy.

Backup and restore procedure.

Reconciliation process after partial failure.

Avoid multiple independent writers to the same logical record unless concurrency control and ownership are explicitly designed.

11.2 Cross-service data access

Prefer an explicit service API or versioned event for cross-service interaction rather than direct writes into another service's private schema.

If direct shared-database access is required, document the dependency, schema compatibility requirements, permissions, and migration coordination.

11.3 Consistency model

Be explicit about whether an operation requires:

Atomic consistency within a single datastore transaction.

Eventual consistency across independent services.

Idempotent at-least-once processing.

Reconciliation after a partial failure.

A compensating action rather than rollback.

Do not assume that a database transaction covers an HTTP call, Redis update, RabbitMQ publication, and external AI-provider request.

12. Database Migration and Schema Evolution

A database schema is a runtime contract. It must evolve in coordination with code that reads and writes it.

12.1 Migration procedure

For every non-trivial migration:

Identify the authoritative schema and migration owner.

Review existing data and constraints.

Estimate table or collection size and operational impact.

Define the compatibility window for old and new application versions.

Prefer additive schema changes first.

Backfill data in a bounded and restartable way.

Validate results before removing old structures.

Define recovery, roll-forward, or rollback behavior.

Record the migration in the release plan.

12.2 Prisma and SQLAlchemy/Alembic

The repository contains a Prisma workflow in the NestJS service and SQLAlchemy/Alembic-related dependencies in the AI service.

Keep each service's schema, migrations, generated artifacts, and runtime expectations aligned. Do not assume both services own the same PostgreSQL schema merely because both use PostgreSQL-related tooling.

12.3 Destructive changes

Dropping a field, table, collection, index, or persisted value can make older deployments fail or destroy information needed for recovery.

Destructive operations require explicit review, verified backups where applicable, a recovery plan, and evidence that no active consumer depends on the removed structure.

13. Networking and Service Discovery

13.1 Container networking

Within a Docker Compose network, services ordinarily address each other by configured service DNS name and internal port. Host-published ports serve a different purpose.

For every dependency, verify:

Service DNS name.

Container port.

Host-published port, if any.

Network membership.

Health check and startup readiness.

Authentication and TLS requirements.

Connection timeout and retry behavior.

A process starting does not prove that its database, broker, or downstream API is ready.

13.2 Gateway and Nginx

The gateway and web Nginx configuration are separate routing layers. Their route prefixes, rewrites, WebSocket behavior, and upstream identities must agree with the backend services.

When changing a route, test:

The intended public path.

The rewritten upstream path.

HTTP methods and query parameters.

Required headers.

Request and response body behavior.

WebSocket upgrade behavior where applicable.

Unauthorized and unavailable-upstream behavior.

13.3 Network exposure

Bind development-only endpoints and local dependencies to appropriate interfaces. Do not assume that a loopback host binding replaces authentication or host security.

Production network policy must distinguish public entry points from internal services, databases, message brokers, and administrative endpoints.

14. Deployment and Release Lifecycle

flowchart TD
    A["A. Reviewed source change"]
    B["B. Dependency and lockfile validation"]
    C["C. Static analysis and tests"]
    D["D. Build service artifacts"]
    E["E. Scan dependencies and images"]
    F["F. Publish immutable artifacts, if configured"]
    G["G. Validate deployment configuration"]
    H["H. Apply compatible schema changes"]
    I["I. Deploy compatible application version"]
    J["J. Verify readiness and critical flows"]
    K["K. Observe errors, latency, and saturation"]
    L["L. Continue rollout or stop"]
    M["M. Roll back or roll forward"]
    N["N. Record release evidence"]

    A --> B --> C --> D --> E --> F --> G --> H --> I --> J --> K --> L
    L -->|Healthy| N
    L -->|Unhealthy| M --> N

This is the desired delivery lifecycle, not proof that every stage is currently enforced in every pipeline.

14.1 CI/CD responsibilities

The repository includes a Jenkins pipeline and CI-related Dockerfiles. The actual pipeline stages and enforcement requirements must be read from Jenkinsfile and the relevant infrastructure files.

CI changes should be reviewed for:

Correct build context and workspace manifests.

Frozen-lockfile installation.

Actual test execution and exit-code propagation.

Service readiness before integration tests.

Unique resources for concurrent builds.

Secret handling and least-privilege credentials.

Cleanup after success, failure, and cancellation.

Diagnostic logs that do not leak sensitive values.

Dependency and image scanning where configured.

Artifact identity and provenance.

Accurate reporting of skipped or unavailable checks.

A successful image build does not prove that the application starts correctly. A successful test does not prove that the deployed image contains the tested source unless the artifact relationship is established.

14.2 Deployment configuration

The repository contains a root Compose configuration and Kubernetes/Kustomize-related deployment assets. Validate each environment's configuration independently.

Review:

Image tags and artifact provenance.

Resource requests and limits.

Readiness and liveness probes.

Secret injection and rotation.

Persistent volume configuration.

Network policy and service exposure.

Schema migration ordering.

Graceful termination and connection draining.

Rollback or roll-forward procedures.

Do not infer a production topology, cloud account, cluster, or successful deployment solely from a manifest's presence.

15. Reliability, Timeouts, Retries, and Backpressure

Every network dependency and asynchronous workflow has a finite failure budget.

15.1 Timeout budgets

Define explicit timeouts for:

Client requests.

Gateway-to-upstream requests.

Database queries and connection acquisition.

Redis operations.

Queue publication and consumption.

External AI-provider calls.

Background job execution.

Graceful shutdown.

An outer request timeout should account for its downstream operations. Unbounded downstream waits can exhaust connection pools and cause cascading failures.

15.2 Retry policy

Retry only when the error is classified as retryable and repeating the operation is safe.

A retry policy should specify:

Retryable error classes.

Maximum attempts or total elapsed time.

Backoff and jitter.

Idempotency behavior.

Cancellation behavior.

Interaction with rate limits.

Logging and metrics.

Terminal failure handling.

Retries can amplify overload. Do not use them as a substitute for bounded concurrency, queue backpressure, or appropriate capacity.

15.3 Graceful shutdown

Long-lived HTTP connections, sockets, queue consumers, and database pools require deliberate shutdown behavior.

A service should stop accepting new work, allow or cancel in-flight work according to its contract, release resources, and exit within the configured termination budget.

Test shutdown during active requests and queued work where the component's correctness depends on it.

15.4 Degraded operation

Document which features remain available when each dependency fails. Avoid declaring the whole service healthy when its required operations cannot be performed.

Distinguish:

Process liveness.

Traffic readiness.

Dependency reachability.

Feature-specific availability.

Data durability and recovery status.

16. Security Architecture

16.1 Authentication and authorization

Authentication establishes identity; authorization decides whether that identity may perform a specific operation.

For sensitive operations:

Verify the credential at the appropriate boundary.

Validate issuer, audience, expiry, and other applicable token constraints.

Authorize access to the specific resource.

Enforce tenant isolation in the actual data-access path.

Protect internal service endpoints.

Test cross-user and cross-tenant denial cases.

Avoid logging credentials or sensitive claims.

The exact credential types and validation policies must be derived from the current implementation and deployment configuration.

16.2 Secrets

Keep production credentials out of source control.

Use an approved runtime secret-injection mechanism.

Scope credentials to the required service and environment.

Rotate exposed credentials.

Avoid embedding secrets in frontend bundles or container image layers.

Redact sensitive values from CI output, logs, traces, and error messages.

16.3 Supply chain

For dependency and build changes:

Review advisory applicability and fixed versions.

Keep lockfiles and manifests consistent.

Maintain supported language runtimes and base images.

Review third-party CI actions and their versions.

Restrict CI permissions to the minimum required.

Verify the provenance of release artifacts where supported.

Treat scanner results as scoped evidence, not a universal security guarantee.

16.4 AI-specific controls

AI workflows require authorization-aware retrieval, prompt-injection resistance, output validation, bounded tool permissions, provider-data controls, and protection against sensitive-data leakage.

Model output is never an authorization decision or trusted executable instruction.

17. Observability and Incident Diagnosis

17.1 Correlation

A critical workflow should be traceable across its service boundaries using appropriate request, trace, event, or job identifiers.

Identifiers must be propagated consistently without treating untrusted client-supplied values as authenticated identity.

17.2 Logs

Where structured logging is implemented, include fields such as:

Timestamp and severity.

Service and environment.

Event or operation name.

Request, trace, or job correlation identifier.

Stable error category.

Dependency name and duration where appropriate.

Avoid high-cardinality metric labels and sensitive log payloads.

17.3 Metrics

Useful service-level indicators include:

Request rate and error rate.

Latency distributions.

Connection-pool saturation.

Dependency timeouts and failures.

Queue depth and oldest-message age.

Worker success, retry, and terminal-failure counts.

AI-provider latency, error rate, and resource consumption.

Restart frequency and readiness failures.

The exact metric names and exporters depend on the implementation. Do not document a metric as available until it has been verified.

17.4 Incident lifecycle

flowchart LR
    A["Detect"] --> B["Correlate"]
    B --> C["Classify impact"]
    C --> D["Contain"]
    D --> E["Restore service"]
    E --> F["Verify recovery"]
    F --> G["Document root cause"]
    G --> H["Add regression protection"]

Incident procedures should identify the responsible service, customer impact, relevant dashboards or logs, mitigation options, data-integrity checks, and follow-up ownership.

18. Performance and Capacity Engineering

Performance targets must be measurable and tied to an explicit workload.

For critical flows, define:

Expected throughput and concurrency.

Payload and result sizes.

Latency percentiles.

CPU and memory budgets.

Connection-pool capacity.

Database query and index requirements.

Queue throughput and backlog tolerance.

AI token and provider-cost budgets.

Timeout and retry budgets.

Review likely sources of contention, including unbounded GraphQL queries, N+1 data access, large in-memory payloads, blocking work, uncontrolled retries, shared connection pools, and expensive model calls.

Benchmark changes under a reproducible workload. Record the environment, data size, concurrency, methodology, and observed results.

No architecture diagram or code review can establish that Relay has zero bottlenecks. That requires measurement and ongoing production observation.

19. Testing and Verification Strategy

The test strategy should cover both component behavior and cross-service contracts.

Test layer

Primary objective

Unit

Deterministic domain and utility behavior

Component

Service logic with controlled dependencies

API contract

Routes, schemas, authorization, and compatibility

Database integration

Persistence, constraints, and migrations

Messaging integration

Publication, delivery, redelivery, and failure handling

End-to-end

Critical user workflows across service boundaries

Security

Unauthorized access, isolation, injection, and abuse cases

Performance

Latency, throughput, saturation, and recovery under load

Deployment smoke

Startup, readiness, and critical operations in the target topology

19.1 Repository checks

From the repository root, the following are useful where the relevant toolchain and scripts are present:

git diff --check
docker compose config --quiet
pnpm install --frozen-lockfile

Run package scripts discovered in the current manifests. Run Go tests from the relevant Go module, and use the Python service's documented dependency and test workflow.

These commands are examples, not proof that all packages have a particular script or that every check has passed.

19.2 Verification record

For a release or substantial architecture change, record:

Repository commit.

Environment and toolchain versions.

Commands executed.

Test suites and results.

Integration dependencies used.

Tests skipped and reasons.

Security scan scope and findings.

Deployment smoke-test results.

Known limitations.

Keep observed results distinct from intended behavior.

20. Architecture Decision Records

Substantial design changes should be recorded under docs/decisions/.

A decision record should explain:

Context and problem.

Constraints and requirements.

Decision and rationale.

Alternatives considered.

Security and privacy implications.

Data and API contract implications.

Deployment and migration strategy.

Operational and failure-mode consequences.

Validation evidence.

Conditions that would justify revisiting the decision.

A decision record is not proof that the decision has been implemented. Update implementation-status documentation separately when a milestone changes.

21. Known Architectural Risks to Verify

These are review areas, not assertions that the repository currently has defects.

Area

Risk

Evidence required

Gateway coverage

Configured upstream does not have the intended route

Route table, integration test, and deployment configuration

Authorization

Client or gateway checks are mistaken for resource authorization

Service-level tests, resolver/handler code, and data-access scoping

Job submission

Status persistence and queue publication can diverge

Failure-window tests and reconciliation design

Worker execution

Duplicate delivery repeats side effects

Idempotency design and redelivery tests

Database ownership

Multiple services write the same logical entity

Schema ownership and migration policy

Schema evolution

Old and new service versions cannot coexist

Expand–migrate–contract plan and compatibility tests

AI retrieval

Unauthorized context reaches the model

Retrieval authorization tests and data-flow review

Configuration

Compose, CI, and deployment variables drift

Cross-environment configuration checks

Observability

Failures cannot be correlated across services

Trace/log propagation and incident exercises

Capacity

Unbounded work exhausts dependencies

Load tests, limits, metrics, and backpressure

CI isolation

Concurrent jobs interfere with shared dependencies

Parallel-build tests and per-build resource isolation

Recovery

Rollback does not restore schema or data compatibility

Recovery drill and explicit release procedure

Prioritize these risks according to exposure, business impact, likelihood, and the evidence available.

22. Architecture Review Checklist

Before approving a change that affects multiple components, reviewers should be able to answer:

Boundaries

Which service owns the behavior?

Which services and clients depend on the interface?

Is the intended request or event path implemented?

Are network and trust boundaries explicit?

Data

Which service owns the affected data?

Are transaction and consistency boundaries understood?

Are migrations compatible with active application versions?

Are retention, deletion, backup, and recovery requirements addressed?

Security

Is authentication performed at the correct boundary?

Is resource-level authorization enforced?

Is tenant isolation maintained?

Are secrets and sensitive data protected?

Are untrusted messages, documents, and model outputs validated?

Reliability

Are timeouts and cancellation defined?

Are retries bounded and safe?

Are duplicate events and partial failures handled?

Is backpressure applied where needed?

Can the service shut down safely?

Operations

Are logs and metrics sufficient to diagnose failure?

Are health and readiness semantics accurate?

Are deployment configuration and service discovery consistent?

Is recovery or roll-forward behavior documented?

Evidence

Are relevant tests and builds passing?

Are cross-service contracts covered?

Are unexecuted checks explicitly disclosed?

Does the documentation match the implementation?

23. A–Z Architecture Verification Matrix

This matrix maps the system lifecycle to an engineering verification activity. The letters are navigation labels, not claims that every step is active in every request.

Letter

Area

Verification question

A

Actors

Are user and operator roles defined?

B

Browser

Are browser credentials and client state handled safely?

C

Client

Are mobile and web API contracts compatible?

D

DNS

Do service names resolve in the intended environment?

E

Edge

Are TLS, ingress, and proxy trust configured correctly?

F

Front door

Are gateway routes explicitly implemented and tested?

G

Gateway

Are forwarding, timeouts, and errors correct?

H

HTTP

Are request parsing and payload limits enforced?

I

Identity

Is authentication validated correctly?

J

Judgment

Is resource authorization enforced?

K

Kernel of logic

Is domain behavior deterministic and testable?

L

Limits

Are rate, size, concurrency, and time limits bounded?

M

Mutation

Are writes protected by correct transaction and integrity rules?

N

Notifications

Are event contracts and delivery semantics explicit?

O

Orchestration

Are job state transitions and dependencies consistent?

P

Persistence

Are schema ownership, migration, and recovery defined?

Q

Queue

Are acknowledgements, retries, and duplicate delivery safe?

R

Retrieval

Is retrieved content authorized and bounded?

S

Synthesis

Are model outputs validated and sensitive data protected?

T

Telemetry

Can requests and jobs be correlated across boundaries?

U

Upgrades

Can dependencies and schemas evolve compatibly?

V

Validation

Do tests prove the stated acceptance criteria?

W

Workloads

Are capacity and backpressure measured?

X

eXceptions

Are failures classified and surfaced safely?

Y

Yield / shutdown

Is in-flight work handled during termination?

Z

Zero-surprise release

Are rollout, verification, and recovery documented?

24. Related Documentation

Verify each referenced path exists before relying on it:

CONTRIBUTING.md — contribution workflow and quality requirements.

docs/decisions/ — architectural decision records.

docs/implementation-status.md — implementation milestones and known gaps.

docs/repository-layout.md — repository organization.

docs/engineering-standards.md — coding and engineering standards, if present.

docs/code-commenting-standard.md — comment quality guidance, if present.

docs/security-and-operations.md — security and operational procedures, if present.

docs/production-guide.md — deployment and production guidance, if present.

docs/mobile-architecture.md — mobile-specific contracts, if present.

services/express-api/README.md — Express API setup and implementation details.

If a referenced document is missing, outdated, or contradicts the implementation, correct the reference or document the gap rather than leaving a broken source of truth.

25. Final Architecture Standard

Relay's architecture should be understandable from its interfaces, code, configuration, tests, and operational evidence.

The standard is explicit ownership, bounded dependencies, secure authorization, intentional consistency, reproducible delivery, observable failure, measured capacity, and safe change.

A diagram is a map of a system, not proof of its behavior. A configuration file is a declaration, not proof of a deployment. A passing test is evidence for the behavior it covers, not a universal guarantee.

The architecture is complete only to the extent that its critical contracts, failure modes, security boundaries, and operational procedures are implemented, verified, and maintained.
