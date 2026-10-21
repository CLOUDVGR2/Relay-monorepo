# Backup, restore and disaster recovery

**No backup is considered valid until a restore has been completed and application-level integrity has been checked.** This runbook is a policy baseline; exact commands, storage locations, credentials and RPO/RTO must be filled in for the chosen production platform.

## 1. Classify data

| System | Likely role | Backup / recovery requirement |
|---|---|---|
| PostgreSQL | relational state, metadata and AI/RAG persistence | consistent snapshots plus WAL/PITR where required; schema migration compatibility |
| MongoDB | chat/user/application documents | consistent replica-aware backup; restore and index validation |
| Redis | cache, rate limits, coordination or idempotency depending on feature | classify each keyspace; decide which state is reconstructible and which must be durable |
| RabbitMQ | in-flight work and durable queues | durable topology, persistent messages, publisher confirms, consumer ack policy; broker recovery test |
| Object/document storage | uploaded source files and derived artifacts, if externalized | versioning, encryption, retention and metadata/data consistency |
| Secrets/configuration | credentials and deploy-time configuration | secure backup/reprovision path, audit and rotation; never put plaintext secrets in application backups |

Redis must not be treated as the source of truth for business data unless the application explicitly defines and tests that contract. A broker backup alone does not guarantee exactly-once business effects.

## 2. Required policy decisions

For each data class, assign an owner and specify RPO, RTO, retention, encryption, residency, deletion obligations, backup frequency, restore priority and legal hold behavior. Set objectives from product impact, not convenience. Document whether cross-region recovery is required and its cost/consistency trade-offs.

## 3. Restore drill

1. Create an isolated recovery environment with network egress restricted by default.
2. Restore infrastructure and secrets/configuration using the approved recovery procedure.
3. Restore databases in dependency order and apply only the migrations compatible with the target application artifact.
4. Restore broker topology and only the messages/queues whose recovery semantics are defined.
5. Verify row/document counts, foreign-key or application invariants, indexes, ownership boundaries, latest committed timestamps and representative user journeys.
6. Start services with outbound side effects disabled; validate readiness and queue safety before enabling consumers.
7. Measure actual RPO/RTO, capture gaps, then update the runbook and owners.
8. Destroy temporary recovery data securely after approval.

## 4. Failure and recovery

- **Bad release:** stop rollout, route traffic to healthy versions, roll back immutable image digests, and preserve logs/traces. Do not roll back schema blindly.
- **Corrupt data:** stop writes when necessary, snapshot the affected state, restore to an isolated point-in-time environment, reconcile writes after the restore point, then cut over with explicit approval.
- **Lost broker:** determine whether accepted jobs can be reconstructed from authoritative status records; never silently report queued work as completed.
- **Credential exposure:** revoke/rotate first, assess access logs, restart dependent services in a controlled order and document the incident.
- **Region/account loss:** execute the approved infrastructure-as-code and data recovery plan; do not improvise by exposing databases publicly.

## 5. Drill cadence

Perform a small restore validation at least monthly and a full disaster-recovery exercise at least quarterly for production-critical data, or more frequently where policy requires. Track time-to-detect, time-to-recover, data loss, operator actions and manual dependencies. A backup job's green status is not restore evidence.
