# Relay Platform Capabilities

This reference maps user-facing and platform capabilities to their owning implementation.

## Collaboration

| Capability | Implementation | Primary mechanisms |
|---|---|---|
| Authentication and profiles | Express API, web and mobile clients | JWT, cookie session, bearer session, validated profile operations |
| User discovery | Express API and clients | User routes and MongoDB models |
| Conversations and messaging | NestJS GraphQL, Express HTTP and Socket.IO | Membership-scoped resolvers, message persistence, realtime event delivery |
| Notifications | Express API and clients | Device token registration, preferences, read state, notification service |
| Activity views | Web and mobile screens | API-backed activity and notification presentation |

## Calls and recording

| Capability | Implementation | Primary mechanisms |
|---|---|---|
| Call lifecycle | NestJS GraphQL | Create, accept, decline, end, history, summary, delete-history operations |
| Media-session authorization | NestJS internal controller | Participant consent state and authorization response |
| Recording upload | NestJS REST controller and storage service | Upload session, completion metadata, refresh, object storage |
| Native audio capture | React Native recording modules and call-media hook | Audio capture, local recovery, call lifecycle coordination |
| Transcription and analysis | Python recording worker | Object retrieval, transcription pipeline, AI service integration |

## Work management and jobs

- GraphQL task operations include create, list, update, checklist item lifecycle, and task-link lifecycle.
- The NestJS jobs module provides a user-facing facade to the Go Jobs API.
- The Go Jobs API validates job submission and status/history requests.
- The Go worker processes RabbitMQ deliveries, coordinates status and idempotency through Redis, and exposes heartbeat data through the API.

## AI and intelligence

- Conversation analysis returns structured summaries and follow-up artifacts from supplied transcript content.
- Incident intelligence models incident lifecycle, evidence collection, investigation traces, approval, execution, and recovery.
- Document RAG provides tenant-scoped document ingestion, embedding, semantic retrieval, and citation-bearing answers.
- Multi-agent execution persists task lifecycle state and exposes progress and results separately from the worker runtime.

## Operations and platform engineering

- Web operational pages provide infrastructure, analytics, jobs, incidents, and AI-oriented views.
- Service health and readiness handlers expose runtime signals.
- Prometheus, Blackbox Exporter, Grafana provisioning, and cAdvisor are represented in Compose/monitoring configuration.
- Dockerfiles, Compose, Kustomize, Terraform, GitHub Actions, and Jenkins assets define build and deployment workflows.

## Capability ownership rule

A client screen is not the source of truth for domain behavior. The service route, resolver, schema, persistence implementation, and tests define the capability contract. A configured integration is not proof of end-to-end availability; runtime verification belongs to the environment in which the integration is deployed.
