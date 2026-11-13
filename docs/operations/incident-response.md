# Incident Response and Service Operations

## Incident roles

For high-impact events, assign an incident commander, technical lead, communications owner, and timeline scribe. Maintain one authoritative status channel and one event timeline.

## Initial response

1. Confirm impact using user-facing indicators and representative journeys.
2. Pause changes that could amplify the incident.
3. Identify affected services, versions, configuration, and dependencies.
4. Preserve relevant logs, metrics, traces, queue state, and database evidence.
5. Apply the smallest reversible mitigation.
6. Communicate impact, scope, mitigation, and the next update time.

## Service-specific diagnostic paths

### API latency or elevated 5xx
Segment by route, method, version, status, and upstream. Correlate request IDs across gateway and services. Compare latency with CPU, memory, event-loop delay, Go goroutines, database pool wait, connection count, and dependency timeout metrics.

### Queue backlog
Inspect ready and unacknowledged messages, oldest message age, consumer count, redelivery rate, job duration, worker heartbeat, and dead-letter depth. Rate-limit producers when accepted work exceeds safe processing capacity. Verify idempotency before replay.

### AI provider degradation
Separate retrieval/database errors from provider errors. Inspect provider status, rate limits, timeout class, model configuration, token usage, and concurrency. Apply only approved fallback behavior and preserve data-handling guarantees.

### Database saturation
Inspect connection utilization, query latency, locks, storage health, and migration activity. Bound client concurrency and avoid coordinated restart storms. Verify data integrity before restoring write traffic.

### Recording workflow
Trace call authorization, upload session creation, object metadata, completion validation, storage availability, worker lease/heartbeat, transcription, and downstream analysis as distinct lifecycle stages.

### Security event
Preserve audit evidence, revoke compromised credentials, restrict affected access, determine impacted identities and data, and follow applicable notification and legal requirements.

## Recovery verification

Confirm user journeys, authorization boundaries, queue progress, data integrity, dependency load, and monitoring stability. Keep the incident active until the agreed observation window is satisfied.

## Post-incident engineering record

Capture impact, timeline, detection, technical cause, contributing conditions, data/security assessment, mitigations, and corrective actions. Each action should have an owner, due date, and measurable acceptance criterion.
