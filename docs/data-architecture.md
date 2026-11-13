# Relay Data Architecture

## Persistence responsibilities

| Technology | Primary use in Relay | Consistency model |
|---|---|---|
| MongoDB / Mongoose | Express-oriented identity, messaging, and notification documents | Document-level operations and indexes |
| PostgreSQL | Relational domain and AI persistence | Transactional relational semantics |
| pgvector | Vector representation and similarity retrieval | PostgreSQL transaction and index semantics |
| Redis | Cache, rate limits, coordination, job state, idempotency, heartbeat | Key/value operations with TTL and configured persistence |
| RabbitMQ | Asynchronous work transport | Delivery/acknowledgement and publisher-confirm semantics |
| S3-compatible object storage | Recording media objects | Object operations and metadata lifecycle |

## Ownership

Express owns its Mongoose models. NestJS owns its domain services and Prisma/Mongoose integrations. The Python AI service owns SQLAlchemy models and Alembic migrations for its relational data domains. Redis key namespaces and RabbitMQ topology are owned by the services that produce and consume them.

## Cross-store workflows

Call recording, asynchronous jobs, and AI workflows can span more than one persistence system. These workflows must model state transitions explicitly and use durable identifiers, idempotency, and reconciliation. A successful database commit does not imply successful object upload or broker publication.

## Tenant model

The AI service maps a Relay user identifier to a tenant workspace. Document, chunk, incident, and multi-agent task access is scoped through the tenant identifier. Retrieval queries must apply tenant filters before ranking and context assembly.

## Schema evolution

- Version migrations with the owning service.
- Add compatible columns/indexes before requiring them in application code.
- Preserve consumer compatibility for shared records and event payloads.
- Review index cardinality and query plans for high-volume paths.
- Validate migration order in a clean database and a representative upgrade path.
- Retain backup and recovery compatibility for schema changes.

## Data lifecycle and privacy

Define retention, deletion, export, and access policies for messages, recordings, documents, embeddings, incidents, and generated artifacts. Derived AI content should retain source linkage and tenant ownership. Sensitive payloads should not be copied into logs or telemetry.
