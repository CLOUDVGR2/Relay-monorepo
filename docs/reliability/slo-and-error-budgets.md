# Reliability Objectives and Error Budgets

## Service indicators

Define indicators around user-visible outcomes rather than process uptime alone.

| Domain | Candidate indicator |
|---|---|
| Authentication | Successful authorized login and session validation rate |
| Messaging | Message submission success and delivery latency |
| GraphQL | Successful authorized operation rate and latency |
| Calls | Call setup success, media authorization success, and lifecycle completion |
| Recording | Upload completion and processing completion rate |
| Jobs | Accepted-to-completed ratio, queue age, and worker processing latency |
| RAG | Successful ingestion, retrieval relevance, and answer latency |
| Multi-agent | Task completion rate, execution duration, and failure distribution |
| Platform | Availability of public ingress and critical dependencies |

Set numerical SLOs only after establishing representative traffic, measurement windows, and service ownership.

## Error-budget policy

An error budget is the permitted unreliability within a defined SLO window. When consumption accelerates, prioritize reliability work and constrain nonessential release risk according to the organization's policy. Budget exhaustion should trigger a documented decision, not an automatic assumption about root cause.

## Health semantics

- **Liveness** indicates that a process can continue making progress.
- **Readiness** indicates that an instance can safely accept its assigned work.
- **Dependency health** reports a defined set of dependency checks.
- **Synthetic checks** exercise representative user journeys with controlled test identities.

Do not make liveness depend on optional remote services; doing so can create restart cascades.

## Resilience patterns

Use end-to-end deadlines, bounded retries with jitter, idempotency for retried mutations, connection-pool limits, concurrency caps, and queue prefetch. Distinguish transient failures from permanent validation errors. Use circuit breakers only with explicit state, bounded probes, and recovery tests.

## Capacity and availability

Replicas do not provide high availability if they share a single failure domain or stateful dependency. Autoscaling requires resource requests, metrics, scale-up headroom, downstream capacity, and scale-down stabilization. Stateful components require supported replication, backup, restore, and upgrade procedures.

## Resilience exercises

Exercise dependency loss, queue redelivery, worker restart, database recovery, provider timeout, object-store unavailability, and graceful shutdown. Capture measured behavior and compare it with service objectives.
