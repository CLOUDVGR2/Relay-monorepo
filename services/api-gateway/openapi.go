package main

import (
	"net/http"
)

const gatewayOpenAPISpec = `{
  "openapi": "3.1.0",
  "info": {
    "title": "Relay API Gateway",
    "version": "1.0.0",
    "summary": "Public HTTP entry point for selected Relay platform services.",
    "description": "The Relay API Gateway is a Go-based application-level HTTP gateway and reverse proxy. It exposes gateway-local liveness and readiness endpoints and forwards an explicit allowlist of HTTP paths to downstream Relay services.\n\n## Responsibilities\n\nThe Go Gateway provides Relay-specific application routing, explicit upstream service mappings, HTTP request and response forwarding, upstream timeout handling, request identification, and gateway-local health and readiness endpoints.\n\n## Relationship with NGINX\n\nRelay uses NGINX as its edge web server and reverse-proxy layer. NGINX handles infrastructure-level traffic management, including incoming HTTP and HTTPS connections, TLS termination when configured, reverse proxying, load balancing, and static content delivery.\n\nThe Go Gateway operates at the application-routing layer. It implements Relay-specific route mappings, upstream integration behavior, gateway-level health and readiness checks, and controlled forwarding between public API paths and internal services.\n\nNGINX can also perform advanced routing, access control, rate limiting, header manipulation, and health checks. The Go Gateway complements NGINX rather than replacing these capabilities.\n\n## Downstream API Contract Ownership\n\nThe Gateway intentionally does not redefine or duplicate downstream API contracts. Authentication, authorization, request validation, business rules, and business response contracts for proxied operations are owned by their respective upstream services.\n\nThis separation prevents contract duplication and conflicting behavior. Each service remains the authoritative owner of its API, security policies, validation rules, and business logic. The Gateway forwards requests and responses without becoming a second source of truth for those contracts.\n\nGateway-owned endpoints, such as health and readiness, are documented separately from proxied downstream operations.\n\n## Service Boundaries\n\nThe Gateway routes requests to designated platform services. It does not expose internal service implementation details or imply that every internal service is publicly accessible.\n\nUpstream services remain responsible for their own authentication, authorization, validation, and business-level error responses. Gateway-level availability checks do not guarantee that every downstream workflow is healthy.\n\n## Routes\n\nGateway-local endpoints: GET /healthz and GET /readyz.\n\nExpress passthrough routes: /api, /api/, and /socket.io/.\n\nNestJS passthrough routes: /jobs, /jobs/, /graphql, /calls, /calls/, /docs, /docs/, /health, and /health/.\n\nThe configured Go Jobs API and Python AI upstreams are not currently exposed through public gateway routes.\n\n## Documentation\n\nGateway OpenAPI specification: /gateway/openapi.json\nGateway Swagger UI: /gateway/docs\nProxied NestJS Swagger UI: /docs"
  },
  "servers": [
    {
      "url": "/",
      "description": "Current Gateway origin"
    }
  ],
  "tags": [
    {
      "name": "Health",
      "description": "Gateway-local process health endpoints."
    }
  ],
  "paths": {
    "/healthz": {
      "get": {
        "tags": ["Health"],
        "summary": "Check gateway liveness",
        "description": "Confirms that the Gateway HTTP process can handle a request. This check does not contact downstream services.",
        "operationId": "getGatewayLiveness",
        "responses": {
          "200": {
            "description": "The Gateway process is responding.",
            "headers": {
              "X-Request-ID": {
                "$ref": "#/components/headers/RequestId"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/HealthStatus"
                },
                "example": {
                  "status": "ok"
                }
              }
            }
          }
        }
      }
    },
    "/readyz": {
      "get": {
        "tags": ["Health"],
        "summary": "Check gateway readiness response",
        "description": "Returns the Gateway's current readiness response. The present implementation returns ready without checking upstream service availability or application workflows.",
        "operationId": "getGatewayReadiness",
        "responses": {
          "200": {
            "description": "The Gateway readiness handler is responding. This is not an upstream dependency health check.",
            "headers": {
              "X-Request-ID": {
                "$ref": "#/components/headers/RequestId"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/HealthStatus"
                },
                "example": {
                  "status": "ready"
                }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "headers": {
      "RequestId": {
        "description": "Gateway-generated or validated request identifier for log correlation. Request identifiers are diagnostic metadata, not authentication credentials.",
        "schema": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        }
      }
    },
    "schemas": {
      "HealthStatus": {
        "type": "object",
        "additionalProperties": false,
        "required": ["status"],
        "properties": {
          "status": {
            "type": "string",
            "enum": ["ok", "ready"],
            "description": "Status returned by the gateway-local health handler."
          }
        }
      }
    }
  }
}`

const gatewaySwaggerHTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Relay API Gateway OpenAPI documentation">
  <title>Relay API Gateway | Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function () {
      SwaggerUIBundle({
        url: "/gateway/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        displayRequestDuration: true,
        persistAuthorization: false
      });
    };
  </script>
</body>
</html>`

func gatewayOpenAPISpecHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(gatewayOpenAPISpec))
}

func gatewaySwaggerUIHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(gatewaySwaggerHTML))
}
