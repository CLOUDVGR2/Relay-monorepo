# Relay Data Architecture

## 1. Design objectives

Relay uses multiple persistence technologies because its domains have different data shapes and processing needs. The architectural requirement is not “one database”; it is explicit ownership, stable identity propagation, bounded consistency rules, safe schema evolution and recoverable cross-store workflows.

## 2. Persistence inventory

| Technology | Primary roles in the repository | Persistence characteristics |
|---|---|---|
| MongoDB / Mongoose | Express user, message, notification and selected collaboration records; Nest integration with existing user accounts | Document-oriented collections and application-level ownership predicates |
| PostgreSQL / Prisma | Nest conversation, participant, task, call, recording, transcript and summary models | Relational constraints and migrations |
| PostgreSQL / SQLAlchemy | AI tenant, document, chunk, incident/evidence and multi-agent task models | Async SQLAlchemy sessions, Alembic migrations, relational constraints |
| pgvector | Document chunk embeddings | Current vector column is 768 dimensions |
| Redis | Rate-limit/cache/coordination functions; worker status, idempotency, leases, heartbeat and progress | Ephemeral coordination; TTL and eviction are part of correctness |
| RabbitMQ | Go asynchronous job transport | Durable queue topology, retries and dead-letter routing |
| RustFS / S3-compatible storage | Local object storage for recording workflow | Binary objects separate from relational metadata |

The Compose stack starts one MongoDB, one PostgreSQL, Redis, RabbitMQ and RustFS. Separate services use separate clients/schemas and migration mechanisms. Do not infer that the database roles are interchangeable or that a cross-store operation is atomic.

## 3. Identity model

Express authentication resolves an account record from MongoDB and sets `req.user`. The NestJS service uses JWT guards and an authenticated user context. Python internal APIs validate an internal bearer token and, for tenant-scoped domains, resolve `X-Relay-User-Id` to an AI-service tenant.

The AI `tenants` table contains a UUID primary key, tenant name/slug, and nullable Relay user ID with uniqueness. The Relay user ID is an integration key—not a secret. Validate it at the service boundary and never confuse the ID header with service authentication.

## 4. AI document schema and referential integrity

`documents` has a tenant foreign key and a unique `(tenant_id, id)` pair. `document_chunks` stores:

- a chunk UUID;
- tenant and document UUIDs;
- chunk index and content;
- nullable 768-dimensional vector embedding;
- JSON metadata for source offsets;
- generated PostgreSQL `tsvector` search representation;
- creation timestamp.

A composite foreign key `(tenant_id, document_id)` references `(documents.tenant_id, documents.id)` to prevent a chunk from being associated with a document in a different tenant. Chunk-level and tenant foreign keys are both defined. PostgreSQL GIN indexing supports keyword search; vector indexing/query behavior is defined in the SQLAlchemy/pgvector query implementation and schema migrations.

## 5. Current Knowledge Base visibility semantics

The current implementation deliberately distinguishes ownership from discovery:

| Operation | Current scope |
|---|---|
| Document ingestion | Authenticated uploader's tenant |
| Document list | Requesting user's tenant |
| Document by ID | Requesting user's tenant |
| Search | Shared retrieval across tenant IDs |
| Answer | Shared retrieval across tenant IDs |
| Uploader attribution | Relay user ID attached to retrieved evidence and resolved to profile display name in Express |

This design makes the Knowledge Base searchable across uploaders, but it does not implement document-level ACLs, organization boundaries, groups, classification labels or visibility settings. A citation can expose a passage from another user's upload to an authenticated requester. Only place content in this corpus if that shared visibility is acceptable. For enterprise confidentiality, the next design step is an explicit access policy (for example organization/corpus/document grants) enforced in both vector and keyword queries, backed by negative cross-tenant tests.

## 6. Other AI tenant domains

Incidents and multi-agent task records are associated with the tenant resolved from the requesting Relay user. Their list/detail operations apply tenant predicates. The shared Knowledge Base search behavior should not be generalized to incidents or multi-agent tasks.

## 7. Cross-store workflow patterns

### Recording

Call/recording state resides in PostgreSQL while audio bytes reside in object storage. The lifecycle needs to account for session creation, upload, completion metadata, object verification, worker claim, transcription and summary state. A database transaction cannot atomically include an object-store upload. Use idempotent state transitions and reconciliation to detect missing or orphaned objects.

### Jobs

RabbitMQ carries job deliveries; Redis holds selected coordination/status/idempotency/heartbeat state. Message acknowledgement and Redis update ordering must be explicit. Re-delivery must not duplicate side effects. Queue state and status state can diverge during partial failure; recovery tools should inspect both.

### Identity

MongoDB is the Relay user profile source used by Express authentication and display-name resolution. AI tenant rows map that stable identity into PostgreSQL. Deleting or merging a user requires a policy for tenant records, documents, incidents, multi-agent tasks, citations and retained audit records.

## 8. Schema and migration governance

- Nest domain relational schema changes belong in Prisma migration history under `services/nest-api/prisma/migrations/`.
- AI-service relational changes belong in Alembic history under `services/ai-service/migrations/versions/`.
- MongoDB model changes require application-level compatibility and migration/backfill planning.
- Redis key changes require TTL, deployment compatibility and worker coordination review.
- RabbitMQ payload changes require producer/consumer compatibility and retry/DLQ handling.
- Object metadata changes require read/write compatibility across the API and worker.

Prefer expand/migrate/contract. Deploy additive schema changes before code requiring them. Preserve IDs and foreign-key integrity when migrating ownership or tenant data. Test both rollback compatibility and forward recovery; a schema rollback is not the default response to an application release rollback.

## 9. Retention, privacy and deletion

The repository contains local volumes and storage adapters but does not define a single enterprise retention schedule for every data class. A production program must define:

- user/profile and collaboration record retention;
- document and embedding retention/deletion propagation;
- conversation transcript and generated analysis retention;
- call recording, transcript and summary retention;
- Redis TTL and RabbitMQ message retention/dead-letter treatment;
- logs, metrics and security event retention;
- backup retention, deletion propagation and legal hold requirements.

A document deletion operation must consider chunks, embeddings, citations, caches, backups and derived AI outputs. A recording deletion operation must consider the object, upload parts, metadata, transcript, summary and processing records.

## 10. Recovery and consistency checks

For each durable data class, identify source of truth, replicas, backup mechanism, restore order, integrity query and replay policy. Test restoration of PostgreSQL, MongoDB and object storage together where workflows span them. Do not use Redis as the sole evidence of durable completion unless the specific data contract says so.
