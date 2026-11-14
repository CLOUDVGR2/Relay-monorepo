# Relay Incident Response and Service Operations

## 1. Purpose

This runbook provides a consistent method for diagnosing application, data, queue, AI, recording and security incidents. It does not replace an organization's formal incident policy, regulatory notification process or on-call escalation schedule.

## 2. Roles

For a material incident, assign:

- **Incident commander:** owns severity, scope, decisions and coordination.
- **Technical lead:** coordinates diagnosis, mitigation and recovery verification.
- **Communications owner:** provides accurate updates to stakeholders.
- **Scribe:** records timeline, actions, evidence and decisions.
- **Service/domain owner:** owns the affected API, data store or worker.

Use one authoritative incident channel and a timestamped event log.

## 3. Initial response

1. Confirm impact using user-visible symptoms and a representative synthetic journey.
2. Establish start time, affected clients, services, versions and environments.
3. Pause changes that may amplify impact.
4. Preserve logs, metrics, request IDs, queue state and relevant data evidence.
5. Determine whether the fault is ingress, authentication, application, dependency, worker, model provider or frontend delivery.
6. Apply the smallest reversible mitigation.
7. Communicate impact, current scope, mitigation, risk and next update time.

## 4. Service-specific diagnostics

### API latency or elevated 5xx

- Segment by route/method/status and request ID.
- Compare Gateway upstream errors with Express/Nest/Python response codes.
- Inspect health/readiness, dependency timeouts, connection pools, CPU/memory, Node event-loop delay, Go goroutines and database locks.
- Confirm that the public path reaches the intended upstream in the Gateway allowlist.

### Authentication or authorization issue

- Separate browser cookie from native bearer flow.
- Verify account existence, JWT/session expiry, trusted origin/CORS and route guard.
- Check that the service credential is present for internal calls without exposing it.
- Verify Relay ID and owner/tenant predicate; do not trust client state.
- Test Socket.IO handshake and room authorization independently.

### Knowledge Base / AI issue

- Inspect browser Network response or mobile error classification.
- Separate client→Express, Express→Python, embedding, vector/keyword retrieval, generation, citation validation and uploader-name lookup.
- Verify document status, chunk count, embedding count, tenant identity and expected shared-retrieval behavior.
- Inspect citation content to distinguish retrieval mismatch from model misinterpretation.
- For a closing-time question, verify whether explicit weekday hours were found and whether deterministic handling applies.
- Do not expand tenant access or remove data filters as an unreviewed workaround.

### Queue backlog or worker failure

- Inspect queue depth, unacknowledged messages, oldest message age, consumer count, redelivery and DLQ depth.
- Check RabbitMQ connection state, worker heartbeat and Redis coordination.
- Verify the retry publish succeeded before manually acknowledging/replaying a message.
- Confirm job ID idempotency and supported type.
- Rate-limit submission if accepted work exceeds safe processing capacity.

### Recording workflow

Trace consent and media authorization, upload session, refresh, client transfer, completion metadata, object existence, processing record, worker lease/heartbeat, object retrieval, transcription and summary. Do not close an incident based only on call termination or upload-request success.

### Database saturation or integrity issue

- Inspect connection utilization, query latency, lock waits, storage health and migration history.
- Pause nonessential workloads before restarting database clients.
- Validate foreign keys and row ownership before repair.
- Restore to a controlled environment first; do not experiment directly on production data.

### Security incident

- Restrict access and rotate compromised credentials.
- Preserve audit/log evidence and determine affected identities/data.
- Review object access, shared Knowledge Base visibility, internal tokens and CI artifacts.
- Follow legal/privacy notification obligations for the affected environment.

## 5. Recovery verification

Verify:

- representative browser and native journeys;
- authentication and negative authorization cases;
- dependency readiness and queue/worker progress;
- data integrity and object/metadata consistency;
- AI retrieval/citation behavior if affected;
- metrics/alerts and error rate stability during an agreed observation window.

## 6. Post-incident review

Record impact, timeline, detection, root and contributing causes, data/security assessment, mitigations, recovery evidence and corrective actions. Each action should have an owner, due date, priority and measurable acceptance criterion. Avoid blame and distinguish trigger from systemic cause.
