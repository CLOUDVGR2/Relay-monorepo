# Backup, Restore, and Disaster Recovery

## Recovery domains

| System | Recovery data | Recovery considerations |
|---|---|---|
| PostgreSQL | Domain state, tenants, documents, embeddings, incidents, multi-agent tasks | Consistent backups, WAL/PITR, schema revision, pgvector/index rebuild |
| MongoDB | Users, messages, notifications, application documents | Consistent replica-aware backup, indexes, ownership and referential validation |
| Redis | Job status, idempotency, coordination, cache, rate-limit state | Classify keyspaces as durable or reconstructible; define persistence and restore behavior |
| RabbitMQ | Queue topology and persistent messages | Durable exchanges/queues, publisher confirms, acknowledgements, replay safety |
| Object storage | Call recordings and derived media | Versioning, encryption, lifecycle, object metadata and database consistency |
| Secrets/configuration | Runtime credentials and deployment configuration | Secure reprovisioning, rotation, access audit; never plaintext backup in repo |

## Recovery objectives

For each data class, define an approved recovery point objective, recovery time objective, retention, encryption, residency, deletion behavior, and recovery owner. Objectives must reflect user and business impact.

## Restore procedure

1. Establish an isolated recovery environment.
2. Reprovision network, service identities, secrets, and storage configuration.
3. Restore databases using the approved consistency point.
4. Apply only schema migrations compatible with the selected application release.
5. Restore broker topology and recoverable messages according to delivery semantics.
6. Restore object data and validate object metadata against application records.
7. Verify counts, indexes, tenant ownership, referential invariants, and representative user journeys.
8. Start workers in controlled mode; confirm idempotency before replaying queued work.
9. Measure actual recovery time and data loss against the approved objectives.
10. Record the exercise and securely dispose of temporary recovery data.

## Recovery principles

- A successful backup job is not restore evidence.
- Do not treat Redis cache state as authoritative business state unless explicitly defined.
- Do not replay a queue without understanding idempotency and side-effect behavior.
- Do not roll back schema independently of application compatibility.
- Preserve security and audit evidence during recovery.

## Exercise cadence

Run periodic database restore validation and full recovery exercises according to the service's criticality and organizational policy. Record the recovery point, measured recovery time, data-integrity checks, and operator actions.
