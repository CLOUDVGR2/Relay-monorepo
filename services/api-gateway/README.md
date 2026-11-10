# Relay API Gateway

The Relay API Gateway is the platform's Go HTTP entry point. It routes selected HTTP and Socket.IO traffic to Express and NestJS services.

## API documentation

| Resource | URL |
|---|---|
| Gateway Swagger UI | http://localhost:8090/gateway/docs |
| Gateway OpenAPI JSON | http://localhost:8090/gateway/openapi.json |
| NestJS Swagger UI | http://localhost:8090/docs |

The Gateway OpenAPI specification documents Gateway-owned endpoints, not every downstream endpoint. Swagger UI assets load from the pinned unpkg CDN.

## Routing

| Public path | Upstream |
|---|---|
| `/api`, `/api/` | Express |
| `/socket.io/` | Express |
| `/jobs`, `/jobs/` | NestJS |
| `/graphql` | NestJS |
| `/calls`, `/calls/` | NestJS |
| `/docs`, `/docs/` | NestJS |
| `/health`, `/health/` | NestJS |
| `/healthz` | Gateway |
| `/readyz` | Gateway |
| `/gateway/docs` | Gateway |
| `/gateway/openapi.json` | Gateway |

Go Jobs API and Python AI origins are configurable but do not have public routes unless explicitly registered.

## Configuration

| Variable | Purpose |
|---|---|
| `GATEWAY_PORT` | Listener port; default 8090 |
| `GATEWAY_EXPRESS_URL` | Express upstream |
| `GATEWAY_NEST_URL` | NestJS upstream |
| `GATEWAY_GO_URL` | Go Jobs API upstream |
| `GATEWAY_PYTHON_URL` | Python AI upstream |

Upstream values must be HTTP(S) origins without credentials, query strings, fragments, or arbitrary path prefixes.

## Request and response behavior

The Gateway preserves downstream authentication and authorization. Proxying does not make routes public.

The Gateway assigns or validates request IDs, applies security headers, and returns JSON `502 Bad Gateway` responses for upstream failures.

Express uses a 75-second response-header timeout. NestJS uses a 10-second response-header timeout. Socket.IO has no response-header timeout to support long-lived connections.

## Health semantics

`GET /healthz` verifies that the Gateway process responds. It does not contact upstream services.

`GET /readyz` currently returns `{"status":"ready"}` without checking dependency availability. It does not prove that upstream services or workflows are healthy.

## Development and validation

The project uses Go 1.27.3.

Run from this directory:

    go test ./...
    go vet ./...
    go build ./...

## Release requirements

Test every published route, including methods, query strings, body forwarding, response headers, timeout behavior, upstream failures, and WebSocket behavior where required. Update the README and OpenAPI specification when routes or operational behavior change.
