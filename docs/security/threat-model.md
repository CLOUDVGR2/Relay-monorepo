# Relay security threat model

**Status:** engineering baseline; validate against the actual deployment and data classification before production approval.

## 1. Security objectives

Relay must preserve confidentiality, integrity, and availability for user identity, conversations, job payloads, uploaded/retrieved documents, model prompts and outputs, and service credentials. Security controls are enforced at service boundaries; private network placement is defense in depth, not authorization.

### Assets and trust boundaries

| Asset / boundary | Primary risks | Required controls |
|---|---|---|
| Browser → frontend / gateway | XSS, CSRF, request smuggling, abusive traffic | TLS at ingress, strict origin policy, security headers, rate limits, body/time limits, safe cookies |
| User → Express / Nest APIs | credential theft, broken object-level authorization, mass assignment | validated input, authn + per-object authz, explicit DTOs, bounded pagination, safe errors |
| Service → service | token replay, confused deputy, lateral movement | distinct service credentials, least-privilege network policy, audience/purpose validation where supported, rotation |
| API → MongoDB / PostgreSQL / Redis | injection, overprivileged credentials, data exfiltration | parameterized queries, least-privilege accounts, TLS in production, private network, timeouts, backups |
| Producer → RabbitMQ → worker | forged, duplicated, oversized, poison messages | authenticated broker access, schema validation, bounded payloads, durable publishing/acks, idempotency, retry limits, DLQ policy |
| User documents → RAG / model / tools | prompt injection, data leakage, resource exhaustion, unauthorized retrieval | tenant/ACL filtering before retrieval, upload limits, parser isolation, token/context budgets, tool allowlists, output validation |
| CI → artifact / registry / deployment | leaked secrets, dependency compromise, mutable artifact drift | secret scanning, dependency/image scanning, minimal permissions, immutable digests, provenance and review |
| Operator → production | accidental destructive change, credential exposure | audited access, just-in-time privilege, tested restore, change review and rollback plan |

## 2. Adversaries and assumptions

Assume hostile anonymous clients, authenticated users attempting cross-user access, compromised dependencies, malicious or malformed documents, compromised upstream providers, duplicate/out-of-order messages, and accidental operator error. Do not assume a queue message is safe because it came from an internal broker. Do not assume model output is safe because it is syntactically valid.

Out of scope for a local developer setup: physical host compromise and cloud-account compromise. Production architecture must separately address these with cloud IAM, workload identity, KMS, network segmentation, audit logs, and organization controls.

## 3. Mandatory invariants

1. **Authentication is not authorization.** Every operation that reads or mutates a user-owned object must enforce ownership/tenant access at the data access boundary.
2. **Fail closed.** Missing or malformed security-critical configuration must prevent startup or reject the operation; never fall back to a public wildcard or shared default secret.
3. **No secret reflection.** Never return or log bearer tokens, cookies, passwords, database URLs, raw provider credentials, or full sensitive prompts.
4. **Bound attacker-controlled work.** Request body, upload size, query complexity, pagination, concurrency, model tokens, retry count, job duration and response time need explicit caps.
5. **Validate at every trust boundary.** HTTP, GraphQL, WebSocket events, queue messages, retrieved content, provider responses and environment configuration are all inputs.
6. **Authorization before retrieval.** Filter document/chunk candidates by tenant and access policy before placing content in a model context. Post-generation filtering is too late.
7. **Idempotent side effects.** Queue redelivery and client retries must not create duplicate business effects. Persist idempotency decisions across process restarts where the effect requires it.
8. **Least privilege.** Each runtime identity can access only the data, network destinations, and secrets required for its role.

## 4. Abuse-case test matrix

| Abuse case | Expected result | Evidence to retain |
|---|---|---|
| Missing/invalid/expired credential | 401/403 with no protected data | auth tests and safe response assertions |
| Valid user requests another user's object | deny without revealing existence when policy requires | object-level authorization tests |
| Forged `X-Forwarded-*` or request ID | trusted proxy metadata is rebuilt; IDs are validated | gateway integration tests |
| Oversized JSON/upload/GraphQL query | bounded 4xx response; no process growth | boundary tests and load profile |
| Malformed, unknown-field, duplicate queue message | reject, quarantine, or safely deduplicate according to contract | worker reliability tests |
| Broker/provider/database outage | bounded timeout, controlled error, no retry storm | fault-injection test and alert |
| Prompt injection in retrieved document | no privilege escalation or unauthorized tool invocation | adversarial RAG/tool tests |
| Secret committed or printed in logs | CI blocks; logs are redacted | secret scanner and log assertions |
| Dependency/image critical CVE | build/release blocked or documented time-bound exception | scan report and signed exception |

## 5. Secrets lifecycle

- Use a managed secret store in production; Kubernetes Secret objects require encryption at rest and tightly scoped RBAC.
- Use separate credentials per environment and service; do not reuse a single broad database or broker account.
- Rotate credentials on a schedule and immediately after suspected exposure. Validate both new and old credential overlap behavior before rollout.
- Keep `.env.example` values nonfunctional. Never place actual credentials in examples, fixtures, screenshots or issue reports.
- Treat frontend `VITE_*` variables as public. Do not inject private API keys into a browser bundle.
- Record owner, consumers, rotation procedure, expiry and last rotation for every production secret.

## 6. Release gate

A release is not security-approved until the team has reviewed the threat model, verified authz boundaries, reviewed scan findings, tested rollback, confirmed TLS/secret-store configuration, and assigned owners/dates to accepted risks. A passing static scan is not proof of exploit resistance.
