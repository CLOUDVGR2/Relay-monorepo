# Reliability Objectives and Error Budgets

**Purpose:** define a measurement and governance framework for Relay reliability. The repository contains health endpoints, metrics, probes, workers, and tests; it does not contain approved production SLO targets or historical SLI measurements. Targets below are deliberately expressed as a method and candidate indicators, not as claims of achieved availability.

## 1. Reliability contract

Reliability is the probability that a user can complete a defined journey within an agreed latency and correctness envelope. Process uptime alone is insufficient. A service can be healthy while a user cannot sign in, retrieve a message, establish a call, complete a recording upload, or receive a grounded answer.

Every SLO must name:

- **service owner** and accountable product owner;
- **user journey** and eligible event population;
- **SLI** with numerator, denominator, filters, and measurement point;
- **target** and rolling evaluation window;
- **exclusions** that are objective and resistant to manipulation;
- **data source** and known instrumentation gaps;
- **error-budget policy** and release implications;
- **runbook** and escalation owner.

## 2. Candidate service-level indicators

| Journey | Candidate SLI | Denominator and caveats |
|---|---|---|
| Authentication | eligible sign-in and session-validation requests completed successfully | exclude user-caused invalid credentials from service error rate; track separately |
| Messaging | accepted message writes and successful realtime delivery | separate durable acceptance from Socket.IO online delivery; offline recipients may not be connected |
| Conversation history | authorized page requests returned within latency objective | use bounded page sizes and distinguish empty history from failure |
| Task management | authorized task mutations committed successfully | include validation and database outcomes; exclude invalid user input from availability numerator where policy permits |
| Call lifecycle | call setup and state transitions complete correctly | segment signaling, authorization, participant state, and client network failures |
| Recording | consent-authorized sessions reach expected upload/track completion | measure only eligible sessions; distinguish client capture, upload, storage, and worker processing |
| Knowledge ingestion | accepted document uploads reach a terminal completed/failed state within a bound | count only valid uploads; record embedding/provider failure separately |
| Knowledge answer | valid authenticated answer requests return grounded output or an explicit abstention | correctness and citation support need quality evaluation; HTTP 200 alone is not correctness |
| Jobs | accepted jobs reach a terminal state within the job-class deadline | exclude canceled jobs only under a documented policy; monitor queue age and DLQ separately |

## 3. Latency definitions

Define start and end timestamps consistently. For synchronous APIs, measure at the public edge and at each service boundary. For asynchronous work, use separate measurements:

- submission-to-acceptance;
- acceptance-to-first-processing;
- processing duration;
- acceptance-to-terminal-completion;
- retry and recovery contribution.

Report distributions, not only averages. Use p50/p90/p95/p99 where sample size supports them. Segment by service, operation class, region, and client platform using bounded labels.

## 4. Error-budget model

For an SLO target `T` over a window containing `N` eligible events:

- allowed bad events = `N × (1 − T)`;
- observed error-budget consumption = bad eligible events / allowed bad events;
- burn rate = observed bad-event ratio / allowed bad-event ratio.

A mature operating model uses a fast-burn and slow-burn alert window, with severity and release policy agreed by product and engineering. Do not copy generic percentages into a production contract without baseline measurements, customer commitments, and risk review.

## 5. Error-budget policy

An organization-approved policy should define what happens when the budget is consumed:

| State | Recommended operating response |
|---|---|
| Healthy budget | normal release cadence; routine risk review |
| Elevated burn | inspect recent releases and dependencies; increase monitoring; prioritize reliability fixes |
| Fast burn / budget exhausted | pause non-essential risky changes; prioritize mitigation and corrective work; require explicit exception approval for urgent changes |
| Repeated exhaustion | revisit architecture, capacity, dependency contracts, product commitments, and target realism |

Security fixes, data-loss prevention, and emergency mitigations should have a clearly documented exception path. An error budget is a prioritization mechanism, not a reason to delay critical safety work.

## 6. Dependency and failure-domain model

Map user journeys to their required dependencies:

- Web: browser → NGINX → Gateway → Express or Nest → database/cache/broker as applicable.
- Mobile: native client → configured public API URL → Gateway → API services.
- Realtime: client Socket.IO → Gateway → Express Socket.IO process → Redis/room and persistence dependencies.
- Knowledge: authenticated request → Express → protected Python AI API → PostgreSQL/pgvector + embedding provider + generation provider.
- Jobs: authenticated Nest facade or internal submitter → Go Jobs API → RabbitMQ → Go worker → Redis job state.
- Recording: call domain and consent → upload lifecycle → object storage → recording worker → transcript/summary persistence.

The criticality of each dependency must be evaluated by journey, not by service name. For example, RabbitMQ may be required for asynchronous job acceptance but not for a simple read-only conversation-history request.

## 7. Recovery objectives

The repository does not define approved RTO or RPO values. Establish them per data class and business impact. A useful initial classification is:

| Data class | Examples | Questions for owner |
|---|---|---|
| Durable collaboration state | users, conversations, messages, tasks, calls | what data-loss window is acceptable; how are transactions restored and reconciled? |
| Knowledge data | documents, chunks, embeddings, tenant metadata | can embeddings be regenerated; what source documents must be backed up independently? |
| Job coordination | queue messages, idempotency keys, status, heartbeats | what is durable in RabbitMQ vs Redis; how are in-flight jobs replayed safely? |
| Media objects | call recordings and artifacts | what object retention, versioning, replication, legal hold, and restore model applies? |
| Observability data | metrics, logs, dashboards | which signals are required for incident investigation and compliance? |

## 8. Review cadence and governance

- Weekly: top reliability risks, open incidents, highest burn, queue/backlog, dependency degradations.
- Monthly: SLO attainment, budget consumption, capacity, backup restore evidence, and recurring incidents.
- Quarterly: failure-mode review, RTO/RPO exercise, dependency contract review, and target recalibration.
- Release: evaluate changed service contracts, migration impact, rollback strategy, and telemetry coverage.

## 9. Required evidence before declaring an SLO active

- [ ] Service owner and journey owner approved.
- [ ] SLI event definition reviewed and version-controlled.
- [ ] Instrumentation validated against synthetic and real traffic.
- [ ] Exclusions documented and independently reviewed.
- [ ] Historical baseline available for representative traffic.
- [ ] Target and evaluation window approved.
- [ ] Burn alerts tested end to end.
- [ ] Error-budget policy approved by product and engineering leadership.
- [ ] Runbook and escalation path linked.

## Related documents

- [Observability](../observability.md)
- [Incident response](../operations/incident-response.md)
- [Backup and disaster recovery](../operations/backup-and-disaster-recovery.md)
