/**
 * Swagger/OpenAPI Documentation Configuration
 * Provides comprehensive API documentation for the Express backend
 * @module swagger
 */

import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

/**
 * Swagger configuration options
 * Defines API metadata, security schemes, and documentation paths
 */
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Relay Express API",
      version: "1.0.0",
      description: `
Relay's Express API provides HTTP endpoints for authentication, messaging,
notifications, incident management, AI-powered workflows, and service health.

## API capabilities

- **Authentication:** User registration, login, session management, and profile operations.
- **Messaging:** Conversation and message operations, including image-upload support.
- **Notifications:** Notification retrieval, read status, preferences, and device-token management.
- **Incidents:** Incident management and investigation workflows.
- **AI:** AI-powered document ingestion and question-answering operations.
- **Health:** Liveness, readiness, and dependency health checks.

## Authentication

The API supports two authentication mechanisms:

- **Cookie authentication:** Browser clients use the HTTP-only \`jwt\` cookie.
- **Bearer authentication:** Native mobile clients can use a JWT access token
  in the \`Authorization: Bearer <token>\` header where supported.

Use the security scheme documented by the individual operation.

## Responses

Where applicable, API errors use the documented error response schema,
including a \`success: false\` value and a descriptive \`message\`.

## Documentation coverage

Operations are generated from Swagger annotations in the Express application
and route files. Routes without Swagger annotations are not displayed here.
Socket.IO events are separate from this HTTP OpenAPI specification.
      `,
      contact: {
        name: "API Support",
        email: "support@relay.chat",
      },
      license: {
        name: "ISC",
        url: "https://opensource.org/licenses/ISC",
      },
    },
    servers: [
      {
        url: "http://localhost:5001",
        description: "Development server",
      },
      {
        url: "https://api.relay.chat",
        description: "Production server",
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "jwt",
          description: "JWT authentication token (HTTP-only cookie)",
        },
        internalBearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "CALL_EVENTS_INTERNAL_TOKEN",
          description: "Service-to-service credential configured by CALL_EVENTS_INTERNAL_TOKEN",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT returned by the native mobile login/signup endpoints",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "MongoDB ObjectId",
            },
            fullName: {
              type: "string",
              description: "User's full name",
              example: "John Doe",
            },
            email: {
              type: "string",
              format: "email",
              description: "User's email address",
              example: "john@example.com",
            },
            profilePic: {
              type: "string",
              description: "Profile picture URL",
              example: "https://cloudinary.com/...",
              nullable: true,
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "Account creation timestamp",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
              description: "Last update timestamp",
            },
          },
        },
        Message: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "MongoDB ObjectId",
            },
            senderId: {
              type: "string",
              description: "ID of the user who sent the message",
            },
            receiverId: {
              type: "string",
              description: "ID of the message recipient",
            },
            text: {
              type: "string",
              description: "Message content",
              example: "Hello, world!",
            },
            image: {
              type: "string",
              description: "Image URL (optional)",
              nullable: true,
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "Message timestamp",
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            message: {
              type: "string",
              description: "Error message",
              example: "Authentication required",
            },
          },
        },
        HealthResponse: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["ok", "shutting_down"],
              description: "Service status",
            },
            timestamp: {
              type: "string",
              format: "date-time",
              description: "Response timestamp",
            },
          },
        },
        NotificationPreferences: {
          type: "object",
          required: ["pushEnabled", "mutedConversationIds", "quietHours"],
          properties: {
            pushEnabled: { type: "boolean" },
            mutedConversationIds: {
              type: "array",
              items: { type: "string" },
            },
            quietHours: {
              type: "object",
              required: ["enabled", "start", "end", "timeZone"],
              properties: {
                enabled: { type: "boolean" },
                start: { type: "string", example: "22:00" },
                end: { type: "string", example: "07:00" },
                timeZone: {
                  type: "string",
                  example: "America/New_York",
                },
              },
            },
          },
        },
        MultiAgentTask: {
          type: "object",
          required: [
            "id", "status", "progress", "result", "error_code",
            "attempt_count", "created_at", "updated_at",
            "started_at", "finished_at"
          ],
          properties: {
            id: { type: "string", format: "uuid" },
            status: {
              type: "string",
              enum: ["queued", "running", "completed", "failed", "cancelled"]
            },
            progress: { type: "object", additionalProperties: true },
            result: { type: "object", nullable: true, additionalProperties: true },
            error_code: { type: "string", nullable: true },
            attempt_count: { type: "integer" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
            started_at: { type: "string", format: "date-time", nullable: true },
            finished_at: { type: "string", format: "date-time", nullable: true }
          }
        },
        ReadinessResponse: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["ready", "not_ready"],
              description: "Readiness status",
            },
            database: {
              type: "string",
              enum: ["connected", "disconnected"],
              description: "Database connection status",
            },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: "Authentication required",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Error",
              },
            },
          },
        },
        NotFound: {
          description: "Resource not found",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Error",
              },
            },
          },
        },
        RateLimitExceeded: {
          description: "Rate limit exceeded",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Error",
              },
            },
          },
        },
        InternalError: {
          description: "Internal server error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Error",
              },
            },
          },
        },
      },
    },
    tags: [
      {
        name: "Authentication",
        description: "User authentication and profile management",
      },
      {
        name: "Messages",
        description: "Real-time messaging operations",
      },
      {
        name: "Health",
        description: "Service health and readiness checks",
      },
      {
        name: "Incidents",
        description: "Incident management and investigation",
      },
      {
        name: "Notifications",
        description: "Notification retrieval, read status, preferences, and device tokens",
      },
      {
        name: "Internal",
        description: "Authenticated service-to-service callbacks",
      },
      {
        name: "AI",
        description: "AI-powered document ingestion and Q&A",
      },
    ],
  },
  apis: ["./src/app.js", "./src/routes/*.js"],
};

/**
 * Generate Swagger specification
 */
const swaggerSpec = swaggerJsdoc(swaggerOptions);

/**
 * Swagger UI setup function
 * @param {Express} app - Express application instance
 */
export const setupSwagger = (app) => {
  // Serve Swagger documentation
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: "Relay Express API Documentation",
    customCss: ".swagger-ui .topbar { display: none }",
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: "none",
      deepLinking: true,
      filter: true,
      showRequestDuration: true,
    },
  }));

  // Serve OpenAPI JSON specification
  app.get("/api-docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
};

export { swaggerSpec };
