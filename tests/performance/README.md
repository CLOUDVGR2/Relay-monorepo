# Relay Performance Test Contract

## 1. Objective

Performance tests quantify the behavior of a defined build in a defined environment under a reproducible workload. This directory currently documents the expected scenario and reporting contract; it should not be presented as evidence that a complete load-test suite or baseline has already been implemented.

## 2. Scenario matrix

Include representative workloads for:

- authentication and session validation;
- message send/read and conversation history pagination;
- GraphQL conversation/task/call operations;
- Socket.IO connection churn, concurrent connections, and message fan-out;
- job submission, queue throughput, retry, and worker recovery;
- document ingestion and hybrid retrieval across realistic corpus sizes;
- AI answer generation at representative prompt/context sizes;
- recording upload, storage, and worker processing;
- concurrent user traffic with background workers active.

Each scenario should include normal, peak, burst, and degraded-dependency cases. Include provider rate limits, database latency, broker reconnect, object-store delay, and worker restarts where relevant.

## 3. Required workload definition

| Field | Description |
|---|---|
| Scenario owner | engineer responsible for validity and follow-up |
| Build identity | commit SHA, image digest, dependency lockfile |
| Environment | instance type, CPU/memory, network, storage, topology |
| Dataset | size, shape, generation method, privacy controls |
| Arrival model | closed/open model, request rate, concurrency, ramp-up |
| Duration | warm-up, steady state, cool-down, repetitions |
| Mix | operation distribution and user think time |
| Success criteria | latency percentiles, errors, throughput, resource ceiling |
| Failure scenarios | fault injected, expected user impact, recovery criterion |

## 4. Metrics to report

- throughput and successful completions;
- p50/p90/p95/p99 latency;
- timeout, retry, and failure rates;
- CPU, memory, network, disk, and process limits;
- DB connection pool wait, query duration, and saturation;
- queue depth, oldest-message age, consumer throughput, and DLQ;
- AI embedding/generation time, token usage, empty retrieval, citation validity, and abstention;
- recording upload and processing duration;
- cost per operation where resource/provider billing data is available.

## 5. Test integrity

Do not compare results across incompatible hardware, dataset size, cache state, model/provider versions, or workload mix without explicit normalization. Run enough repetitions to understand variance. Preserve scripts, raw results, and environment metadata. Keep synthetic user data and credentials isolated.

## 6. Interpretation

A performance report must identify the bottleneck, measured evidence, confidence/variance, user impact, and next experiment. A local laptop run is useful for regression direction but is not a production capacity guarantee. Establish organization-approved thresholds before making SLO or capacity claims.
