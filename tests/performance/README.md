# Relay Performance Test Contract

## Objective

Performance tests quantify service behavior under a defined workload. Every result must be reproducible and tied to a commit, environment, configuration, and dataset.

## Scenario matrix

Include representative workloads for:
- authentication and session validation;
- message send/read and conversation history pagination;
- GraphQL conversation/task/call operations;
- Socket.IO connection and event delivery;
- job submission, queue throughput, and worker recovery;
- document ingestion, semantic retrieval, and grounded answer generation;
- multi-agent task execution;
- recording upload completion and asynchronous processing.

## Required report fields

- commit SHA and artifact versions;
- test environment and topology;
- request mix, concurrency, duration, and data volume;
- warm-up and measurement windows;
- throughput and p50/p95/p99 latency;
- HTTP error and timeout rate;
- CPU, memory, network, and database utilization;
- queue depth, oldest message age, worker count, and completion rate;
- model/provider name, token budget, and provider latency for AI scenarios;
- test tool, scripts, and raw result artifacts.

## Method

Run baseline and candidate under the same workload and environment. Change one variable at a time. Separate cold-start, warm-cache, and steady-state behavior. Do not infer production capacity from a local developer machine.
