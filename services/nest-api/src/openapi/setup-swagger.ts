import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Registers the canonical Relay Platform OpenAPI document and Swagger UI.
 *
 * REST endpoints are described by OpenAPI decorators on their controllers
 * and DTOs. GraphQL remains available separately at /graphql.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Relay Platform API')
    .setDescription(`
# Relay Platform API

The Relay Platform API provides a unified, secure interface to the Relay
application and its supporting backend services.

It powers the Relay web and mobile applications and enables authorized
internal services to communicate with platform capabilities.

## Platform capabilities

### Application and system information
Provides root application information and service health monitoring.

### Authentication and authorization
Protects user-facing resources through supported JWT authentication
mechanisms and restricts internal operations to trusted services.

### Background job processing
Allows authenticated clients to submit background jobs, retrieve job
history, and inspect individual job execution status.

### Real-time communication and media sessions
Supports internal authorization of active media sessions, participant
identity verification, and recording-consent authorization.

### Call recording management
Supports recording upload initialization, signed upload URL refresh,
upload verification and completion, and authorized recording playback.

### Health monitoring
Provides liveness and readiness endpoints for infrastructure monitoring
and deployment orchestration.

## API architecture

This documentation describes the HTTP REST interface exposed by the
Relay NestJS application.

The platform also exposes a separate GraphQL API at \`/graphql\`.
GraphQL operations and schemas are not represented in this OpenAPI document.

REST endpoints use standard HTTP methods, status codes, and JSON request
and response payloads unless otherwise specified.

## Authentication and security

Protected endpoints require the authentication mechanism documented
for each operation.

Supported security schemes:

- **jwt:** HTTP-only JWT cookie authentication for authenticated users.
- **bearer:** JWT bearer-token authentication for authorized clients.
- **internalBearer:** Server-to-server bearer authentication for trusted
  internal platform services.

Internal credentials must never be exposed to browser applications,
mobile applications, or untrusted third parties.

Use the Authorize control in Swagger UI to provide credentials when
testing protected endpoints.

## HTTP response conventions

The API uses standard HTTP status codes:

- **200 OK:** Request completed successfully.
- **201 Created:** A resource or operation was successfully created.
- **400 Bad Request:** Request validation failed or supplied input was invalid.
- **401 Unauthorized:** Authentication credentials are missing or invalid.
- **404 Not Found:** The requested resource does not exist or is inaccessible.
- **409 Conflict:** The requested operation conflicts with the resource state.
- **502 Bad Gateway:** An upstream service returned an invalid response
  or could not complete the operation.
- **503 Service Unavailable:** A required service or dependency is unavailable.
- **500 Internal Server Error:** An unexpected server-side error occurred.

Error responses follow a standardized structure containing:

- statusCode
- timestamp
- path
- requestId
- message
- error

Validation messages may be returned as an array when multiple fields
fail validation.

Internal implementation details and sensitive exception information
are not exposed in unexpected server error responses.

## API documentation resources

- Swagger UI: \`/docs\`
- OpenAPI JSON: \`/docs/openapi.json\`
- GraphQL endpoint: \`/graphql\`

## Intended audience

This API is intended for authorized Relay web and mobile clients,
internal backend services, platform developers, and approved integrations.

Always follow the authentication requirements and request/response
schemas documented for each operation.
    `)
    .setVersion('1.0.0')
    .addServer('http://localhost:3000', 'Local development')
    .addServer('https://api.relay.chat', 'Production')
    .addCookieAuth(
      'jwt',
      {
        type: 'apiKey',
        in: 'cookie',
        name: 'jwt',
        description:
          'HTTP-only JWT authentication cookie for authenticated Relay users.',
      },
      'jwt',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'JWT bearer authentication for authorized user-facing API clients.',
      },
      'bearer',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Internal service token',
        description:
          'Restricted server-to-server credential. Never expose this token to browser or mobile clients.',
      },
      'internalBearer',
    )
    .addTag('App', 'Root application information and API metadata.')
    .addTag('Health', 'Application liveness and dependency readiness checks.')
    .addTag('Jobs', 'Authenticated background job submission and management.')
    .addTag(
      'Call recording uploads',
      'Recording upload initialization, verification, completion, and playback.',
    )
    .addTag(
      'Internal media sessions',
      'Trusted server-to-server media session authorization.',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/openapi.json',
    customSiteTitle: 'Relay Platform API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
      displayRequestDuration: true,
      deepLinking: true,
      tryItOutEnabled: true,
    },
  });
}
