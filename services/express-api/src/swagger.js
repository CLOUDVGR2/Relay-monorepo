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
      title: "Relay Chat API",
      version: "1.0.0",
      description: `
        Production-grade real-time chat API with comprehensive features:
        - JWT-based authentication
        - Real-time messaging via Socket.IO
        - Rate limiting and security
        - Image upload support
        - AI integration
        - Incident management

        ## Authentication
        Most endpoints require authentication via HTTP-only JWT cookie.
        Include the cookie in requests: \`jwt=<token>\`
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
        name: "AI",
        description: "AI-powered document ingestion and Q&A",
      },
    ],
  },
  apis: ["./src/routes/*.js"],
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
    customSiteTitle: "Relay API Documentation",
    customCss: ".swagger-ui .topbar { display: none }",
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: "none",
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
