# Incident response and operational runbooks

## 1. Severity and command

Use the organization's approved incident severity policy. At minimum, distinguish broad user impact/data loss/security exposure from partial degradation and isolated defects. Assign an incident commander, technical lead, communications owner and scribe for high-severity incidents. Keep one timeline and one authoritative status channel.

## 2. First 10 minutes

1. Confirm impact from user-visible SLIs, not one pod's status.
2. Stop risky deployments and automated jobs that amplify impact.
3. Identify the last known good artifact/configuration and the affected service boundary.
4. Preserve relevant logs, metrics, traces and queue/database state; avoid collecting unnecessary user content or secrets.
5. Apply the smallest reversible mitigation: rollback, reduce concurrency, disable a noncritical feature, or fail closed.
6. Communicate current impact, scope, mitigation and next update time.

## 3. Symptom runbooks

### Elevated API 5xx or latency

- Segment by route, version, status and upstream; compare latency with CPU, RSS, event-loop delay, Go goroutines, DB pool wait and connection counts.
- Check recent deploy/config changes and downstream timeouts. A 502 at the gateway may represent upstream failure; correlate by request ID.
- Reduce load on the saturated dependency, cap concurrency, and shed optional work. Avoid increasing retries without a deadline and retry budget.
- Roll back only after verifying schema compatibility and the target artifact's provenance.

### Queue backlog or repeated failures

- Inspect ready/unacked depth, oldest message age, consumer count, redelivery rate, job duration, DLQ and dependency health.
- Pause or rate-limit producers if the backlog is growing faster than consumers can drain it.
- Identify poison payloads and permanent validation failures; quarantine rather than retry forever.
- Confirm idempotency before replaying messages. Record accepted, started, completed, failed and replayed counts.

### AI provider degradation

- Check provider timeout/rate-limit/error classes, model/config changes, token consumption and concurrent requests.
- Apply bounded concurrency and deadlines; use a documented fallback only if quality and privacy behavior are acceptable.
- Do not silently send sensitive data to a different provider or model. Disable noncritical generation if required and preserve core messaging paths.
- Distinguish retrieval failure from generation failure and report degraded behavior explicitly.

### Database unavailable or connection pool saturated

- Check DB service health, connection usage, query latency, locks and recent migrations.
- Reduce request/worker concurrency; do not restart all clients simultaneously if that creates a reconnect storm.
- Restore service or roll back the incompatible change. Validate data integrity before re-enabling writes.

### Suspected security incident

- Preserve evidence and involve the security owner immediately.
- Revoke compromised credentials and restrict affected access; do not post secrets or payloads into public issue trackers.
- Determine affected identities, resources, time window and exfiltration scope from audit logs.
- Follow applicable notification/legal requirements; document containment and credential rotation.

## 4. Recovery verification

After mitigation, verify user journeys, authorization boundaries, queue progress, data integrity and downstream load. Keep the incident open until metrics stabilize over an agreed observation window. Follow with a blameless review that identifies systemic controls, action owners and due dates—not only individual mistakes.

## 5. Review template

- Impact and duration:
- Detection source and time:
- Timeline:
- Root cause and contributing conditions:
- What worked / what delayed recovery:
- Data integrity and security assessment:
- Corrective actions (owner, due date, measurable acceptance criteria):
- Tests/alerts/runbooks added:
