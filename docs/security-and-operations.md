# Relay Security and Operations Notes

## Authentication
Express AI routes apply `protectRoute`. Authentication routes include signup, login, logout, profile update, and authenticated session checking. Signup, login, and profile-update routes use dedicated rate limiters.

## Trusted Origins and Request Limits
AI answer and document-ingestion routes apply a trusted-origin check. The Express API validates document title, content, and optional source URI before forwarding ingestion requests. The ingestion route has a dedicated rate limiter and a 120-second upstream timeout.

## Internal Python Authentication
The Python document router requires an internal Bearer token. Token comparison uses a constant-time comparison function. If the expected token is not configured, requests are rejected. The token must remain server-side and must never be embedded in frontend code or logs.

## Tenant Scoping
Python document creation, search, answer, list, and detail operations obtain a tenant using `X-Relay-User-Id`. List and detail queries filter by tenant ID. A document not found within the requested tenant returns 404.

This is the implemented access pattern visible in the document routes. Live cross-user access prevention should also be verified through automated API security tests.

## Safe Error Handling
The Express AI proxy returns controlled errors for invalid requests, rate limits, upstream failures, malformed upstream responses, and timeouts. Do not expose internal tokens, cookies, or provider credentials in client-facing errors.

## Operational Verification
Before treating Relay as production-ready, verify:
- Cross-tenant access tests for search, answer, list, and document detail.
- Authentication and origin-policy behavior.
- Rate-limit behavior under repeated requests.
- Ollama and Python AI failure handling.
- Database backup and restore procedures.
- Monitoring, alerting, deployment configuration, and recovery procedures.

Do not claim an uptime SLA, production SLO, backup guarantee, or compliance certification unless it is established by an authoritative operational source.
