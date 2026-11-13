# Security and Operational Architecture

## Identity domains

Relay uses several distinct identity mechanisms:
- browser authentication through server-managed cookie/session behavior;
- native authentication through bearer JWTs;
- Socket.IO authentication through the connection handshake token;
- internal service authentication through dedicated bearer tokens;
- tenant context in the Python AI API through the Relay user identity header.

These identities are not interchangeable. Internal service authentication establishes the caller; tenant context scopes the requested user's data; resource authorization determines whether the operation is permitted.

## Request boundary controls

The Express API configures Helmet, explicit trusted origins, bounded JSON parsing, authentication middleware, and metrics. The Go gateway normalizes request IDs, applies response security headers, restricts forwarded metadata to trusted proxy peers, and forwards only registered paths. NestJS uses HTTP and GraphQL guards, DTO validation, centralized error handling, and throttling components.

## Data protection

- Keep credentials in environment-specific secret stores.
- Use least-privilege database and object-storage identities.
- Scope user-owned records by verified user identity.
- Scope RAG retrieval by tenant before model context assembly.
- Protect internal endpoints with service authentication.
- Apply retention and deletion policies to recordings, messages, documents, and derived artifacts.

## Operational signals

- Liveness answers whether a process is responding.
- Readiness answers whether the instance can accept its assigned work.
- Dependency checks describe a specific set of upstream dependencies.
- Queue depth, oldest message age, worker heartbeat, and completion rate describe asynchronous progress.
- Synthetic user journeys measure behavior across multiple services.

## Secure operations

Use immutable image digests for controlled release promotion, review IAM permissions, audit secret access, validate restore procedures, and preserve deployment manifests alongside the application source. Operational commands should be scoped to the target namespace and environment.
