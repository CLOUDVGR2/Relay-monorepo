# Relay API Gateway

**Runtime:** Go
**Responsibility:** public HTTP reverse proxy, WebSocket pass-through, edge transport policy, request correlation, health, and gateway metrics.

## 1. Position in the architecture

The Gateway is the single configured edge router for selected Relay paths. It owns routing and transport controls; downstream services continue to own authentication, authorization, domain validation, persistence, and response semantics. A URL configured for an upstream does not imply that the upstream is publicly routable.

## 2. Public route allowlist

| Incoming path | Upstream / behavior | Notes |
|---|---|---|
| `/api`, `/api/` | Express API | collaboration, auth, AI adapter, and other Express-mounted routes |
| `/socket.io/` | Express API | WebSocket/polling transport; upgrade headers preserved |
| `/jobs`, `/jobs/` | NestJS API | user-facing Nest facade, not the raw Go Jobs API |
| `/graphql`, `/graphql/` | NestJS API | GraphQL endpoint |
| `/calls`, `/calls/` | NestJS API | call and recording domain routes |
| `/docs`, `/docs/` | NestJS API | API docs proxy where enabled |
| `/health`, `/health/` | NestJS API | health route mapping |
| `/healthz` | Gateway local | process liveness |
| `/readyz` | Gateway local | checks configured Express and Nest readiness |
| `/gateway/docs`, `/gateway/openapi.json` | Gateway local | gateway documentation/spec endpoints |

The exact allowlist is defined in `services/api-gateway` source and is the source of truth. The current Gateway environment includes Go Jobs and Python AI upstream URLs for internal topology, but the public route table does not expose arbitrary `/v1/*` Python paths or the raw Jobs API. NGINX's local diagnostic mappings are a separate frontend proxy configuration and should not be confused with public Gateway routes.

## 3. Request processing

The Gateway loads configuration, constructs upstream reverse proxies, handles approved route prefixes, forwards required request metadata, supports WebSocket upgrades, and exposes metrics/health endpoints. Configuration includes upstream URLs, listener/metrics ports, trusted proxy CIDRs, and transport/request limits. Review `config.go`, `server.go`, `metrics.go`, and associated tests when changing behavior.

## 4. Trust and security

- Trust forwarded IP/protocol metadata only from configured trusted proxy ranges.
- Do not treat client-supplied `X-Forwarded-For` or identity headers as authenticated proof.
- Preserve downstream Authorization/cookie semantics without logging secrets.
- Keep route matching exact and allowlist-based; do not add a catch-all proxy.
- Bound dial, response-header, idle-connection, and proxy timeouts.
- Apply security headers and request IDs consistently.
- Keep metrics labels low-cardinality.

Gateway proxying does not replace Express/Nest/Python internal auth. Each destination must validate its own credentials.

## 5. Health and observability

- `/healthz`: local liveness.
- `/readyz`: dependency-aware readiness for configured Express and Nest endpoints.
- Prometheus metrics are served on the configured metrics listener (Compose uses a separate internal metrics port).
- Request IDs and bounded status/latency metrics support correlation.

A readiness failure should identify the dependency class without exposing credentials or configuration values.

## 6. Local development and tests

```bash
cd services/api-gateway
go test ./...
go vet ./...
go build ./...
```

The root Compose file sets `GATEWAY_EXPRESS_URL`, `GATEWAY_NEST_URL`, `GATEWAY_GO_URL`, and `GATEWAY_PYTHON_URL`. Verify the actual environment variable names in `config.go`; do not copy production credentials into local shell history.

## 7. Change checklist

- [ ] Add only the required route prefix and document its service owner.
- [ ] Update route/transport tests, including prefix and trailing-slash behavior.
- [ ] Verify WebSocket upgrade and timeout behavior where applicable.
- [ ] Test trusted proxy handling and spoofed forwarded headers.
- [ ] Confirm health and metrics semantics.
- [ ] Update NGINX path proxying only if the browser-facing path changes.
- [ ] Update [request flows](../../docs/architecture/request-flows.md) and [API reference](../../docs/ai-api-reference.md) when relevant.
