# Relay Express API

**Runtime:** Node.js / Express
**Responsibility:** authentication-backed collaboration HTTP routes, MongoDB persistence, Socket.IO realtime behavior, selected notifications/incidents, and the public adapter to internal AI operations.

## 1. Runtime composition

| Path | Responsibility |
|---|---|
| `src/bootstrap.js` | startup, configuration, dependency initialization, process lifecycle |
| `src/server.js` | server composition where applicable |
| `src/app.js` | middleware, health/metrics, and route mounting |
| `src/routes/` | HTTP route modules |
| `src/controllers/` | reusable domain handlers |
| `src/middleware/auth.middleware.js` | session/JWT authentication and `req.user` hydration |
| `src/models/` | Mongoose models such as User, Message, Notification, AI execution |
| `src/lib/socket.js` | Socket.IO server, identity, rooms, lifecycle |
| `src/lib/redis.js` | Redis connection and coordination |

## 2. Route domains

The app mounts `/api/auth`, `/api/messages`, `/api/notifications`, `/api/incidents`, `/api/ai`, and internal call-event routes under `/internal`. The public edge still routes `/api` to this service through the Go Gateway.

## 3. Authentication and request security

The auth middleware validates a signed session/JWT and loads the corresponding Mongo User record, selecting the fields needed downstream (`_id`, `email`, `fullName`, `profilePic`). The password hash is excluded. `req.user` is therefore a trusted server-loaded identity for authenticated route handlers.

Browser requests are subject to configured CORS/origin handling and session/cookie behavior. Native clients use bearer credentials. Socket.IO has a separate handshake authentication path; HTTP auth success does not automatically establish a valid socket session.

Security controls include Helmet, credentialed CORS, JSON body limits, route-specific rate limits, trusted-origin checks, and centralized error handling. Review actual middleware order in `src/app.js` before changing a route.

## 4. Realtime contract

Socket.IO owns connection lifecycle, authenticated user identity, and room targeting. Event producers and consumers must agree on payload shape, idempotency, ordering assumptions, reconnection behavior, and room authorization. Never allow clients to select arbitrary user rooms without server-side authorization.

## 5. AI adapter and shared Knowledge Base

Express forwards authenticated `/api/ai` requests to the internal Python service with:

- internal service Authorization credential;
- `X-Relay-User-Id` derived from `req.user._id`;
- bounded JSON body and an abort deadline.

For answer responses, Express resolves cited documents' internal uploader IDs against the User model and returns display names as `uploaded_by`. It removes internal uploader IDs from public citation objects. The current Knowledge Base search/answer retrieval path is shared across authenticated Relay users, while document ingestion/list/direct retrieval operations remain uploader-tenant-scoped. Uploader display attribution is informative; it is not an ACL.

## 6. Local development

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @relay/express-api run dev
pnpm --filter @relay/express-api run test:integration
```

The service requires MongoDB and Redis configuration. The root Compose topology is the simplest integrated environment. Use `.env.example` as a variable inventory; do not copy secrets from another environment.

## 7. Operational guidance

Monitor request rate/errors/latency, authentication failures, Mongo/Redis connections, Socket.IO connection errors, upload/AI adapter timeouts, and internal dependency readiness. `Session ID unknown` is a Socket.IO Engine.IO session/transport symptom; correlate it with client reconnect and proxy behavior rather than treating it automatically as an AI route failure.

## 8. Change checklist

- [ ] Auth and origin behavior tested for browser and native clients.
- [ ] Body-size and timeout limits appropriate to the route.
- [ ] User ownership and authorization derived from `req.user`, not client-supplied IDs.
- [ ] Socket.IO room/event permissions reviewed.
- [ ] Service-to-service token and user identity propagated separately.
- [ ] Error responses do not leak upstream secrets or internal stack traces.
- [ ] Tests and API docs updated.
