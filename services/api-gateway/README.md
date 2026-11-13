# Relay API Gateway

## Responsibility

The Go API Gateway is the public application-routing layer for selected Relay HTTP and Socket.IO paths. It uses the standard Go HTTP server and reverse-proxy packages. It does not duplicate downstream authentication, authorization, validation, or business response contracts.

## Route policy

| Path | Upstream |
|---|---|
| `/api`, `/api/` | Express API |
| `/socket.io/` | Express API |
| `/jobs`, `/jobs/` | NestJS API |
| `/graphql`, `/graphql/` | NestJS API |
| `/calls`, `/calls/` | NestJS API |
| `/docs`, `/docs/` | NestJS API |
| `/health`, `/health/` | NestJS API |
| `/healthz`, `/readyz` | Gateway-local |
| `/gateway/docs`, `/gateway/openapi.json` | Gateway-local |

Configured Go Jobs API and Python upstream URLs are not public route registrations in the current route table.

## Request processing

The gateway:
- validates an incoming request ID or generates a new one;
- propagates the ID to downstream requests and response headers;
- sets `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`;
- derives forwarding metadata from the direct peer and configured trusted proxy CIDRs;
- uses bounded connection pools and response-header timeouts;
- preserves connection hijacking for WebSocket upgrades;
- returns a normalized `502` response when an upstream cannot be reached;
- records route-level metrics with low-cardinality labels.

## Health and observability

- `GET /healthz` is process liveness.
- `GET /readyz` probes Express and NestJS readiness endpoints.
- `GET /gateway/openapi.json` and `/gateway/docs` expose gateway-owned documentation.
- Gateway metrics are exposed through the metrics handler configured by the service runtime.

## Configuration

The configuration parser in `config.go` defines upstream URLs, listener port, and trusted proxy CIDRs. Runtime defaults and validation in source are authoritative. Keep upstream DNS names internal to the target network.

## Development

```bash
go test ./...
go vet ./...
go build ./...
```

Run from `services/api-gateway/`.
