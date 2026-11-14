# Relay Backup, Restore and Disaster Recovery

## 1. Recovery domains

Relay workflows span multiple persistence systems. Recovery must consider the complete data relationship, not only a single database snapshot.

| Domain | Data | Recovery consideration |
|---|---|---|
| MongoDB | User identity, messages, notifications and related documents | Preserve account identity and collaboration ownership |
| PostgreSQL | Nest domain data and AI tenants/documents/chunks/incidents/tasks | Preserve schema revision, foreign keys and relational consistency |
| Object storage | Recording objects and other binary assets | Restore object versions/metadata and verify referenced objects |
| RabbitMQ | In-flight and queued jobs | Recreate topology and decide whether messages are retained, replayed or safely regenerated |
| Redis | Cache, leases, idempotency, heartbeat and transient progress/status | Reinitialize transient coordination; do not blindly restore expired lock state |
| Client-local state | Offline message cache and recording recovery | Device-specific recovery, retention and privacy controls |

## 2. Recovery objectives

The repository does not establish numerical RTO or RPO commitments. Each deployment owner must define approved targets based on business criticality and measured backup/restore performance. Record actual observed RTO/RPO from recovery exercises; do not infer them from a backup schedule.

## 3. Backup policy requirements

For every durable store, document:

- backup frequency and consistency model;
- encryption and key ownership;
- retention, immutability and deletion/hold policy;
- account and operator access policy;
- backup verification and integrity checks;
- off-region/off-account strategy where required;
- restore dependencies and ordering;
- owner and escalation path.

Compose named volumes are local persistence, not a backup strategy. The repository does not include a complete, production-validated backup automation and recovery program for every data store.

## 4. Restore procedure framework

1. Declare recovery event and choose a target recovery environment.
2. Preserve the failed environment and relevant evidence.
3. Verify backup artifact identity, age, integrity and access.
4. Provision compatible infrastructure and secrets.
5. Restore PostgreSQL and apply only compatible migrations.
6. Restore MongoDB and verify user identity/cross-store mappings.
7. Restore object storage and validate object references/metadata.
8. Recreate RabbitMQ topology; decide queue replay using idempotency and side-effect analysis.
9. Reinitialize Redis coordination state rather than replaying stale locks/leases blindly.
10. Start services in dependency order and validate readiness.
11. Run data-integrity queries and representative browser/mobile/worker workflows.
12. Record measured recovery time, recovery point and outstanding data loss.

## 5. Workflow-specific recovery

### Recording

Check upload/session records, object existence, object size/checksum metadata, processing jobs, transcripts and summaries. Requeue only after verifying idempotency and whether a previous worker completed a side effect.

### Jobs

Inspect ready/unacknowledged/DLQ messages, status records, idempotency keys and worker heartbeats. Do not replay all queues without assessing duplicate side effects.

### AI Knowledge Base

Restore documents, chunks, search vectors and embeddings together. Confirm embedding dimension/model compatibility. Rebuild embeddings only through a planned reprocessing path. Preserve uploader tenant mapping and shared-retrieval access rules.

## 6. Recovery exercises

Run periodic database restore validation and end-to-end recovery exercises according to service criticality. Exercise dependency loss, broker outage, object-store failure, worker interruption, provider timeout and credential rotation. Capture evidence and corrective actions.
