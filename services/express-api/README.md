# Express API

## Purpose

This is the canonical Express + Socket.IO service used by the root Compose runtime. It was moved from the original `backend/` directory because that was the source path built by the supplied root `compose.yaml`. The separate original `express-api/` directory is preserved under `archive/express-api-legacy/` and is not the canonical runtime.

## Responsibilities

The service contains HTTP routes for application, authentication, messaging, incident and AI-related operations; Socket.IO integration; MongoDB/Mongoose models; Redis integration; rate limiting; and health-related endpoints. Exact behavior is defined by the route, middleware, model and test implementations.

## Configuration and dependencies

The package manifest declares Express, Socket.IO, Mongoose, Redis, authentication/security middleware, RabbitMQ and related integration dependencies. Runtime configuration is supplied through environment variables and `.env.example`. Compose injects MongoDB and Redis service URLs plus an internal Python AI service URL and token.

Never expose internal service credentials to browser code. Validate trusted origins, proxy trust, request limits, cookie/session configuration, and authentication/authorization for both HTTP and Socket.IO flows.

## Development and tests

```bash
cd services/express-api
npm install
npm run dev
npm run test:integration
```

From the repository root, use `npm run test:express-api`. Integration tests may require running dependencies and environment variables. A passing test suite is evidence only for the scenarios it exercises.

## Operational requirements

- Verify resource-level authorization on every protected HTTP route.
- Verify socket handshake authentication, room membership and event-level authorization.
- Bound request bodies, uploads, database operations and external service calls.
- Test Redis outage behavior and distributed rate-limit semantics.
- Test AI service timeout, unavailable service, malformed response and internal-token rotation.
- Keep MongoDB schema/index and retention behavior explicit.
- Preserve correlation identifiers and redact credentials and sensitive user content from logs.

## Native client contracts

The Expo client uses `POST /api/auth/mobile/login` and `POST /api/auth/mobile/signup`. These routes share the browser handlers' validation and rate limits but return a bearer token and do not set the browser auth cookie. Protected HTTP routes accept either the existing `jwt` cookie or an `Authorization: Bearer` token. Socket.IO accepts the browser cookie or a token in the handshake `auth.token` field.

`GET /api/messages/:id` returns a bounded chronological page (`limit` defaults to 50 and must be 1–100). When older messages exist, `X-Has-More: true` and `X-Next-Cursor` provide a stable cursor based on creation time and ObjectId. Cursor pagination is intentionally shared by the web and native clients. Message responses use `Cache-Control: no-store` because they contain private conversation data.

The native JWT is currently stateless and expires after seven days. Native logout deletes the credential on-device but does not revoke a copied token; do not represent that as server-side revocation. See [Mobile Architecture and Security](../../docs/mobile-architecture.md) for the known limitation and required session-lifecycle roadmap.
