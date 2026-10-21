# API Gateway

## Purpose

This service is a Go HTTP reverse proxy that centralizes a selected set of Relay HTTP paths and provides gateway-local health/readiness endpoints. It is independently built from `services/api-gateway/Dockerfile` and has its own Go module.

## Configuration

| Variable | Purpose |
|---|---|
| `GATEWAY_PORT` | Listener port; defaults to `8090` and is validated as a TCP port |
| `GATEWAY_EXPRESS_URL` | Express upstream origin |
| `GATEWAY_NEST_URL` | NestJS upstream origin |
| `GATEWAY_GO_URL` | Go jobs API upstream origin |
| `GATEWAY_PYTHON_URL` | Python AI upstream origin |

Upstream variables must be HTTP(S) origins without embedded credentials, query strings, fragments, or arbitrary path prefixes. Compose supplies service-DNS origins; local execution defaults to loopback ports.

## Routes and operational semantics

The authoritative route table is in `server.go`. It includes gateway-local `/healthz` and `/readyz` endpoints, selected Express paths (`/api`, `/api/`, `/socket.io/`), and selected NestJS paths (`/jobs`, `/jobs/`, `/graphql`, `/docs`, `/docs/`, `/health`, `/health/`). Do not infer that all routes of an upstream service are exposed. Although Go and Python origins are configurable, a route must be explicitly registered and tested before it is considered public.

The gateway emits structured logs, assigns/validates request identifiers, applies response security headers, and returns JSON for upstream failures. Review implementation and tests before changing status codes, path stripping, streaming, WebSocket upgrades, or response formats.

## Development and validation

```bash
cd services/api-gateway
go test ./...
go vet ./...
go build ./...
```

The gateway's health endpoint verifies the local process handler. Readiness and upstream checks should be interpreted according to their implementation, not as proof that every application workflow is healthy.

## Release requirements

Add route-level tests for each intended published path, including methods, query strings, body forwarding, response headers, timeout behavior, upstream connection failure, WebSocket behavior where required, and safe error serialization. Document any new public route in the architecture and security review.
