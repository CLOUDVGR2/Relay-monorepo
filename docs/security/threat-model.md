# Relay Security Threat Model

## 1. Scope and methodology

This threat model describes the primary trust boundaries visible in the repository. It is a living engineering artifact, not an independent penetration-test report or certification assessment. Reassess it when routes, service identities, data classes, object-storage policy or deployment topology change.

## 2. Assets

| Asset | Examples | Security objective |
|---|---|---|
| User identity/session | JWTs, cookies, mobile bearer tokens, profile data | Prevent impersonation and unauthorized session use |
| Collaboration data | Messages, conversations, participant state, notifications | Enforce ownership and participant boundaries |
| Call/recording data | Call state, consent, audio objects, transcripts and summaries | Enforce participant authorization, consent and retention |
| Knowledge data | Documents, chunks, embeddings, citations and uploader identity | Prevent unauthorized disclosure and manipulation |
| AI task/incident state | Prompts, progress, outputs, evidence and remediation state | Enforce tenant and action authorization |
| Service credentials | Internal API tokens, JWT secret, database/object-store credentials | Prevent service impersonation and lateral movement |
| Queue and worker state | Job payloads, idempotency keys, leases, retry/DLQ state | Prevent duplicate side effects and forged work |
| Infrastructure | Container images, Terraform/Kustomize, secrets, networks | Protect runtime integrity and deployment authority |

## 3. Trust boundaries

1. Browser/mobile client to NGINX/Gateway.
2. Gateway to Express/Nest.
3. Express/Nest user request context to internal Python service.
4. Nest to Go Jobs API.
5. API producers to RabbitMQ and background workers.
6. Nest/recording worker to object storage.
7. Application services to MongoDB, PostgreSQL and Redis.
8. CI and infrastructure automation to registries, cloud accounts and clusters.

Each boundary requires authentication, authorization, input validation, bounded resource use and safe failure behavior.

## 4. Adversary model

Consider unauthenticated internet clients, authenticated low-privilege users, compromised client devices, malicious or poisoned uploaded documents, compromised service credentials, misconfigured proxies, malicious queue producers, compromised worker containers and supply-chain dependencies.

## 5. Threat register

| Threat | Impact | Existing mitigation evidence | Residual review requirement |
|---|---|---|---|
| Credential theft / replay | Account takeover | JWT/cookie/bearer auth, token parsing, protected routes | Key rotation, revocation, refresh policy, device/session inventory |
| Cross-user resource access | Private data disclosure | Tenant/owner filters in selected APIs and data queries | Full negative authorization coverage for every operation and transport |
| Shared RAG corpus disclosure | Uploaded passage visible to other authenticated users | Uploader attribution; upload/list/detail owner scope | Current retrieval intentionally crosses tenant IDs; add ACLs if data is not universally shareable |
| Internal token compromise | Lateral service access | Internal bearer dependencies in Python/Go | Per-service/per-env token rotation, least privilege, mTLS or workload identity review |
| Spoofed forwarded headers | IP/protocol trust bypass | Gateway trusted-proxy CIDR logic and tests | Ensure production proxy CIDRs are exact and edge strips untrusted incoming headers |
| Socket.IO room abuse | Message/event disclosure | Handshake auth and user-room functions | Negative room membership and reconnect/session invalidation tests |
| Request exhaustion | CPU/memory/provider/DB denial | Payload bounds, rate limits, timeouts, top-k/step caps | Load tests, per-user concurrency budgets and distributed rate limiting review |
| Prompt/document injection | Model instruction hijack | System prompt treats excerpts as untrusted; response/schema/citation validation | Adversarial evals, tool permissions, output content safety and corpus curation |
| RAG false attribution/grounding | Misleading answer or wrong source | Citation IDs restricted to retrieved chunks; uploader identity lookup | Entailment evaluation, conflicting-source handling, retrieval relevance and ACL controls |
| Queue redelivery/duplicate execution | Duplicate side effects | Idempotency coordination, manual ack, retry/DLQ handling | Side-effect idempotency audit and failure-injection tests |
| Stale worker claim | Concurrent/late writes | Lease/fencing fields in multi-agent task model | Lease expiry and stale-owner race tests under real Redis/Postgres |
| Recording object exposure | Sensitive media disclosure | Storage adapter, scoped roles in infrastructure assets | Bucket policy, signed URL expiry, encryption, retention and access audit |
| Dependency/image compromise | Runtime compromise | Lockfiles, dependency audits, Gitleaks/Trivy/go vulnerability checks | Image signing, SBOM, provenance, base-image patch SLA |
| Secret leakage in logs/CI | Credential compromise | Secret scanning and log hygiene code | Runtime log review, artifact scan, rotation and incident drills |

## 6. Security invariants

- A client-supplied identity is never trusted without authenticated server context.
- User identity and service bearer credentials remain separate.
- Internal APIs must not become public merely because they are documented.
- Private resource reads/writes must include ownership/authorization predicates.
- Shared Knowledge Base search is explicitly shared and must not be represented as private.
- A queue delivery is not acknowledged until the required processing/retry/DLQ operation is complete.
- Model-generated identifiers/actions are validated against server-owned state and authorization.
- Secrets and sensitive content are not placed in client bundles or logs.

## 7. Abuse-case verification

Minimum negative tests should include:

- missing/expired/invalid JWT and deleted user;
- cross-user message, conversation, task, job and document-by-ID access;
- unauthorized Socket.IO handshake and room join;
- invalid/rotated internal API token;
- malformed or oversized request body;
- invalid user ID or tenant header;
- cross-user Knowledge Base retrieval with expected shared visibility clearly asserted;
- malformed model JSON and citation ID not in retrieved set;
- poisoned document attempting to override system instructions;
- RabbitMQ redelivery, duplicate job and DLQ publish failure;
- stale worker lease/fencing race;
- object-store permission denial and orphaned upload.

## 8. Credential lifecycle

Use separate secrets for user JWT signing, Python internal API, Go Jobs API, call-event integration, database access and object storage. Inject secrets from the target environment's secret manager. Rotate on schedule and after suspected exposure. Test rotation without simultaneously invalidating required service availability.

## 9. Review boundary

This model describes repository-visible safeguards and gaps. It does not establish SOC 2, ISO 27001, HIPAA, PCI DSS or other compliance. Compliance claims require defined scope, control evidence, independent assessment and continued operational proof.
