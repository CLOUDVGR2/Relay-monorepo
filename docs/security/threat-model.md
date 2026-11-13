# Relay Security Threat Model

## 1. Security objectives

Protect identity, conversation content, task and incident records, documents, model context, recordings, service credentials, and deployment control planes across confidentiality, integrity, and availability dimensions.

## 2. Assets and trust boundaries

| Boundary | Threats | Security controls |
|---|---|---|
| Browser/mobile to public API | Credential theft, CSRF, XSS, abusive traffic | TLS, origin policy, safe cookies, bearer handling, rate limits, input validation |
| API to domain data | IDOR, tenant crossover, mass assignment | Authenticated identity, resource authorization, tenant-scoped queries, DTO/schema validation |
| Gateway to upstream | Spoofed forwarded headers, request smuggling, route exposure | Explicit route allowlist, trusted proxy CIDRs, request IDs, bounded transports |
| Service to service | Token replay, confused deputy, lateral movement | Dedicated internal tokens, least privilege, private networking, rotation |
| API to database | Injection, overprivileged credentials, data exfiltration | Parameterized/ORM access, scoped accounts, TLS, private networking, backups |
| Queue to worker | Forged, duplicated, malformed, poison messages | Broker auth, schema validation, bounded payloads, manual ack, idempotency, DLQ |
| Documents to RAG/model | Prompt injection, cross-tenant retrieval, data leakage | Tenant filtering before retrieval, parser limits, context budgets, output validation |
| Recording pipeline | Unauthorized media access, object substitution, retention errors | Consent authorization, scoped object access, signed upload/download workflow, audit metadata |
| CI/CD to runtime | Secret leakage, dependency compromise, mutable artifact drift | Secret scanning, dependency/image scans, least-privilege credentials, immutable digests |
| Operator to environment | Destructive changes, credential misuse | Role separation, review, audit, tested recovery, scoped access |

## 3. Adversary model

Assume anonymous hostile clients, authenticated users probing other users' resources, malicious documents, compromised dependencies, malformed or duplicated queue deliveries, untrusted model output, provider outages, and accidental operator actions. Internal network location is not proof of authorization.

## 4. Security invariants

1. Derive acting-user identity from verified credentials.
2. Authorize every user-owned resource operation at the service boundary.
3. Apply tenant filters before document retrieval and model context assembly.
4. Authenticate internal service callers independently of tenant identity.
5. Fail closed when security-critical configuration is missing.
6. Never log credentials, cookies, authorization headers, or unnecessary private content.
7. Bound attacker-controlled work across HTTP, uploads, GraphQL, model calls, queues, and workers.
8. Make replayable side effects idempotent where delivery or client retries can duplicate work.
9. Validate messages and provider responses as untrusted input.
10. Grant each runtime only the permissions required for its function.

## 5. Abuse-case verification

| Scenario | Expected behavior | Evidence |
|---|---|---|
| Missing/expired credential | Reject protected operation | Authentication tests |
| User accesses another user's record | Deny access | Object authorization tests |
| Tenant header references invalid identity | Reject tenant resolution | AI API security tests |
| Oversized request or upload | Bounded 4xx response | Boundary tests |
| Duplicate queue delivery | No duplicate business effect | Idempotency tests |
| Invalid queue payload | Reject or dead-letter | Worker tests |
| Malicious document instructions | Treat as data, not authority | RAG evaluation suite |
| Forged forwarded headers | Ignore unless immediate peer is trusted | Gateway proxy tests |
| Secret missing at startup | Fail validation or reject protected operation | Configuration tests |

## 6. Credential lifecycle

Use unique secrets by environment and service purpose. Provision through an approved secret manager, rotate on schedule and after exposure, restrict read permissions, and audit access. Build-time client variables must never contain server-only credentials.

## 7. Security review boundary

A threat model describes expected controls and verification. A production security assessment additionally requires environment-specific IAM, network, TLS, key management, logging, retention, vulnerability, and penetration-test evidence.
