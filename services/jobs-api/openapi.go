package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

const openAPISpec = `{
  "openapi": "3.1.0",
  "info": {
    "title": "Relay Jobs API",
    "version": "1.0.0",
    "summary": "Internal job submission, status, and worker health API.",
    "description": "The Relay Jobs API accepts supported background jobs, publishes them to RabbitMQ, stores job status and history in Redis, and reports dependency and worker health. Internal job operations require a shared bearer token. The ownerId query parameter scopes status lookups but is supplied by the calling service; it is not independently authenticated as an end-user identity by this API."
  },
  "servers": [
    {
      "url": "http://localhost:8083",
      "description": "Local Docker Compose host binding"
    }
  ],
  "tags": [
    {"name": "Health", "description": "Liveness and dependency readiness."},
    {"name": "Workers", "description": "Worker heartbeat status."},
    {"name": "Jobs", "description": "Authenticated internal job submission and status operations."}
  ],
  "paths": {
    "/healthz": {
      "get": {
        "tags": ["Health"],
        "summary": "Check API liveness",
        "description": "Confirms that the HTTP process is responding. It does not verify RabbitMQ, Redis, or worker availability.",
        "operationId": "getHealth",
        "responses": {
          "200": {
            "description": "The API process is responding.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HealthResponse"}}}
          }
        }
      }
    },
    "/rabbitmqz": {
      "get": {
        "tags": ["Health"],
        "summary": "Check RabbitMQ publisher status",
        "description": "Reports whether the RabbitMQ publisher currently has a ready connection and channel.",
        "operationId": "getRabbitMQHealth",
        "responses": {
          "200": {
            "description": "The publisher is ready.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HealthResponse"}}}
          },
          "503": {
            "description": "The publisher is unavailable.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}}
          }
        }
      }
    },
    "/readyz": {
      "get": {
        "tags": ["Health"],
        "summary": "Check API readiness",
        "description": "Requires a ready RabbitMQ publisher, an initialized job-status store, and a readable Go worker heartbeat in the production configuration.",
        "operationId": "getReadiness",
        "responses": {
          "200": {
            "description": "Required dependencies are available.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/HealthResponse"}}}
          },
          "503": {
            "description": "A required dependency is unavailable.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}}
          }
        }
      }
    },
    "/worker-health": {
      "get": {
        "tags": ["Workers"],
        "summary": "Get worker health snapshot",
        "description": "Returns heartbeat-derived status for go-worker, recording-worker, and multi-agent-worker. Possible reported states include online, stale, missing, and unknown. This endpoint does not require the internal bearer token.",
        "operationId": "getWorkerHealth",
        "responses": {
          "200": {
            "description": "Worker health snapshot.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/WorkerHealthSnapshot"}}}
          }
        }
      }
    },
    "/internal/v1/jobs": {
      "post": {
        "tags": ["Jobs"],
        "summary": "Submit a background job",
        "description": "Accepts the welcome job type, creates a queued status record when a status store is configured, and publishes a persistent message to the durable go.jobs RabbitMQ queue. A 202 response is returned after a positive publisher confirmation. Redis status creation and RabbitMQ publication are separate operations, not one atomic transaction.",
        "operationId": "submitJob",
        "security": [{"internalBearerAuth": []}],
        "requestBody": {
          "required": true,
          "description": "A welcome job request. The request body is limited to 64 KiB.",
          "content": {"application/json": {"schema": {"$ref": "#/components/schemas/SubmitJobRequest"}}}
        },
        "responses": {
          "202": {
            "description": "The job was published and positively acknowledged by RabbitMQ.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/SubmitJobResponse"}}}
          },
          "400": {
            "description": "Invalid JSON, unsupported job type, missing or invalid fields, or request limits exceeded.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}}
          },
          "401": {
            "description": "Bearer token is missing or invalid.",
            "headers": {"WWW-Authenticate": {"schema": {"type": "string"}}},
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}}
          },
          "503": {
            "description": "Internal authentication is not configured, status storage is unavailable, or job publication failed.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}}
          }
        }
      },
      "get": {
        "tags": ["Jobs"],
        "summary": "List job history",
        "description": "Returns the most recent job statuses indexed for the supplied ownerId. Results are ordered newest first. The ownerId is supplied by the authenticated internal caller and is not derived from the bearer token.",
        "operationId": "listJobs",
        "security": [{"internalBearerAuth": []}],
        "parameters": [
          {
            "name": "ownerId",
            "in": "query",
            "required": true,
            "description": "Owner identifier used to scope the Redis job-history index.",
            "schema": {"type": "string", "minLength": 1}
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "description": "Maximum number of jobs to return. Defaults to 50.",
            "schema": {"type": "integer", "minimum": 1, "maximum": 100, "default": 50}
          }
        ],
        "responses": {
          "200": {
            "description": "Job history.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/JobHistoryResponse"}}}
          },
          "400": {
            "description": "ownerId is missing or limit is outside the supported range.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}}
          },
          "401": {
            "description": "Bearer token is missing or invalid.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}}
          },
          "503": {
            "description": "Job history storage is temporarily unavailable.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}}
          }
        }
      }
    },
    "/internal/v1/jobs/{id}": {
      "get": {
        "tags": ["Jobs"],
        "summary": "Get job status",
        "description": "Returns a job status only when the supplied ownerId matches the owner associated with the stored job.",
        "operationId": "getJobStatus",
        "security": [{"internalBearerAuth": []}],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "Job identifier.",
            "schema": {"type": "string", "minLength": 1}
          },
          {
            "name": "ownerId",
            "in": "query",
            "required": true,
            "description": "Owner identifier used to scope access to the stored job status.",
            "schema": {"type": "string", "minLength": 1}
          }
        ],
        "responses": {
          "200": {
            "description": "Job status.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/JobStatus"}}}
          },
          "400": {
            "description": "ownerId is missing.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}}
          },
          "401": {
            "description": "Bearer token is missing or invalid.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}}
          },
          "404": {
            "description": "Job does not exist or is not associated with the supplied ownerId.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}}
          },
          "503": {
            "description": "Job status storage is temporarily unavailable.",
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}}
          }
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "internalBearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "Opaque token",
        "description": "Shared internal service token configured with INTERNAL_API_TOKEN."
      }
    },
    "schemas": {
      "HealthResponse": {
        "type": "object",
        "required": ["status", "service"],
        "properties": {
          "status": {"type": "string", "examples": ["ok", "ready", "unavailable"]},
          "service": {"type": "string", "examples": ["go-api", "rabbitmq"]}
        }
      },
      "ErrorResponse": {
        "type": "object",
        "required": ["error"],
        "properties": {
          "error": {"type": "string"}
        }
      },
      "SubmitJobRequest": {
        "type": "object",
        "required": ["type", "message"],
        "properties": {
          "id": {"type": "string", "maxLength": 128, "description": "Optional caller-supplied job ID. If omitted, the API generates one."},
          "ownerId": {"type": "string", "description": "Required when the production Redis status store is enabled."},
          "type": {"type": "string", "const": "welcome"},
          "message": {"type": "string", "minLength": 1, "maxLength": 10000}
        },
        "additionalProperties": false
      },
      "SubmitJobResponse": {
        "type": "object",
        "required": ["id", "status"],
        "properties": {
          "id": {"type": "string"},
          "status": {"type": "string", "const": "queued"}
        }
      },
      "JobStatus": {
        "type": "object",
        "required": ["id", "type", "status", "attempt", "createdAt", "updatedAt"],
        "properties": {
          "id": {"type": "string"},
          "type": {"type": "string"},
          "status": {"type": "string"},
          "attempt": {"type": "integer"},
          "createdAt": {"type": "string", "format": "date-time"},
          "updatedAt": {"type": "string", "format": "date-time"},
          "error": {"type": "string"}
        }
      },
      "JobHistoryResponse": {
        "type": "object",
        "required": ["jobs"],
        "properties": {
          "jobs": {
            "type": "array",
            "items": {"$ref": "#/components/schemas/JobStatus"}
          }
        }
      },
      "WorkerHealthSnapshot": {
        "type": "object",
        "required": ["workers"],
        "properties": {
          "workers": {
            "type": "array",
            "items": {"$ref": "#/components/schemas/WorkerHealth"}
          }
        }
      },
      "WorkerHealth": {
        "type": "object",
        "required": ["worker", "status"],
        "properties": {
          "worker": {"type": "string"},
          "status": {"type": "string", "enum": ["online", "stale", "missing", "unknown"]},
          "updated_at": {"type": "string"},
          "last_poll_at": {"type": "string"},
          "last_poll_error": {"type": "string"}
        }
      }
    }
  }
}`

const swaggerHTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Relay Jobs API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>body{margin:0;background:#fafafa}#swagger-ui{max-width:1200px;margin:0 auto}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => SwaggerUIBundle({
      url: "/openapi.json",
      dom_id: "#swagger-ui",
      deepLinking: true,
      displayRequestDuration: true
    });
  </script>
</body>
</html>`

func openAPIHandler(c *gin.Context) {
	c.Data(http.StatusOK, "application/json; charset=utf-8", []byte(openAPISpec))
}

func swaggerUIHandler(c *gin.Context) {
	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(swaggerHTML))
}
