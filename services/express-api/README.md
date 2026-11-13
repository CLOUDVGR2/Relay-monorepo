# Relay Express API

## Service responsibility

The Express service owns collaboration-oriented HTTP routes and Socket.IO realtime behavior. Its route composition includes authentication, messages, notifications, incidents, AI integration, and internal call-event handling.

## Architecture

- `src/app.js` composes middleware, health endpoints, metrics, and route modules.
- `src/bootstrap.js` owns process startup and lifecycle.
- `src/routes/` defines HTTP route contracts.
- `src/controllers/` contains request handlers.
- `src/models/` defines Mongoose models.
- `src/lib/socket.js` configures Socket.IO and realtime rooms.
- `src/lib/db.js` and `src/lib/redis.js` manage persistence connections.
- `src/middleware/` contains authentication and rate limiting.
- `src/swagger.js` provides API documentation.

## Domain capabilities

- Account registration, login, mobile login/signup, logout, session check, and profile update.
- User lookup and message history/send/read/update operations.
- Notification preferences, device-token registration, listing, and read state.
- Incident and AI route integration.
- Internal call event intake from the NestJS call domain.
- Realtime connection and user-room event delivery.

## Authentication contracts

Browser clients use the cookie-based session behavior. Native clients use `POST /api/auth/mobile/login` and `POST /api/auth/mobile/signup` to obtain a bearer token. Protected routes accept the configured cookie or bearer authorization mode. Socket.IO authenticates using browser cookie context or a token supplied in the handshake `auth.token` field.

The native token is stateless and has a configured expiration. Client-side deletion on logout is not equivalent to server-side revocation of a copied token.

## Data and dependencies

MongoDB/Mongoose stores collaboration documents. Redis supports selected cache, rate-limit, and coordination functions. The service integrates with the Python AI API and NestJS call domain through internal endpoints and tokens.

## Development and tests

```bash
pnpm --dir services/express-api dev
pnpm --dir services/express-api run test:integration
```

From the repository root:

```bash
pnpm test:express-api
```

Validate HTTP and Socket.IO authorization separately, including room membership and event-level access.
