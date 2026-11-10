/** Tests for app e2e spec in the nest api. */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { setupSwagger } from '../src/openapi/setup-swagger.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { GqlAuthGuard } from '../src/auth/gql-auth.guard.js';

describe('Application (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule =
      await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideGuard(GqlAuthGuard)
        .useValue({
          canActivate: () => true,
        })
        .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    setupSwagger(app);
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET / should preserve the original response', async () => {
    await request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('GET /health should return a healthy liveness response', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({
        status: 'ok',
      });
  });

  it('GET /docs should serve the Swagger UI', async () => {
    await request(app.getHttpServer())
      .get('/docs')
      .expect(200);
  });

  it('GET /docs/openapi.json should expose the OpenAPI document', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs/openapi.json')
      .expect(200);

    const document = response.body;

    expect(document.openapi).toMatch(/^3\./);
    expect(document.info).toMatchObject({
      title: 'Relay Platform API',
      version: '1.0.0',
    });

    const paths = document.paths;
    expect(paths).toEqual(
      expect.objectContaining({
        '/': expect.objectContaining({ get: expect.any(Object) }),
        '/health': expect.objectContaining({ get: expect.any(Object) }),
        '/health/ready': expect.objectContaining({ get: expect.any(Object) }),
        '/jobs': expect.objectContaining({
          get: expect.any(Object),
          post: expect.any(Object),
        }),
        '/jobs/{id}': expect.objectContaining({ get: expect.any(Object) }),
        '/calls/{callId}/recording': expect.objectContaining({
          get: expect.any(Object),
        }),
        '/calls/{callId}/recording-upload': expect.objectContaining({
          post: expect.any(Object),
        }),
        '/calls/recording-uploads/{uploadId}/refresh': expect.objectContaining({
          post: expect.any(Object),
        }),
        '/calls/recording-uploads/{uploadId}/complete': expect.objectContaining({
          post: expect.any(Object),
        }),
        '/internal/media-sessions/authorize': expect.objectContaining({
          post: expect.any(Object),
        }),
      }),
    );

    // Every documented REST operation must expose the standardized
    // HTTP 500 response using the shared error DTO.
    const documentedOperations = [
      paths['/'].get,
      paths['/health'].get,
      paths['/health/ready'].get,
      paths['/jobs'].get,
      paths['/jobs'].post,
      paths['/jobs/{id}'].get,
      paths['/calls/{callId}/recording'].get,
      paths['/calls/{callId}/recording-upload'].post,
      paths['/calls/recording-uploads/{uploadId}/refresh'].post,
      paths['/calls/recording-uploads/{uploadId}/complete'].post,
      paths['/internal/media-sessions/authorize'].post,
    ];

    expect(documentedOperations).toHaveLength(11);

    for (const operation of documentedOperations) {
      expect(operation.responses).toHaveProperty('500');
      expect(operation.responses['500'].content['application/json'].schema)
        .toEqual({
          $ref: '#/components/schemas/ApiErrorResponseDto',
        });
    }

    // Recording endpoint error descriptions must match service behavior.
    const recordingPlayback = paths['/calls/{callId}/recording'].get;
    expect(recordingPlayback.responses['400'].description)
      .toBe('The call ID is not a valid UUID.');
    expect(recordingPlayback.responses['404'].description)
      .toBe('Call or recording not found or playback not authorized.');
    expect(recordingPlayback.responses['409'].description)
      .toBe('Recording is not ready for playback.');

    const createRecordingUpload =
      paths['/calls/{callId}/recording-upload'].post;
    expect(createRecordingUpload.responses['400'].description)
      .toBe('The call ID is not a valid UUID.');
    expect(createRecordingUpload.responses['404'].description)
      .toBe('Call not found or recording is not authorized.');
    expect(createRecordingUpload.responses['409'].description)
      .toBe('An upload is already completed.');

    const refreshRecordingUpload =
      paths['/calls/recording-uploads/{uploadId}/refresh'].post;
    expect(refreshRecordingUpload.responses['400'].description)
      .toBe('The upload ID is not a valid UUID.');
    expect(refreshRecordingUpload.responses['404'].description)
      .toBe('Upload not found or not authorized.');
    expect(refreshRecordingUpload.responses['409'].description)
      .toBe('Upload is no longer pending.');

    const completeRecordingUpload =
      paths['/calls/recording-uploads/{uploadId}/complete'].post;
    expect(completeRecordingUpload.responses['400'].description)
      .toBe('The upload ID, recording metadata, or uploaded object is invalid.');
    expect(completeRecordingUpload.responses['404'].description)
      .toBe('Upload not found or not authorized.');
    expect(completeRecordingUpload.responses['409'].description)
      .toBe(
        'Upload is no longer pending or another completion request claimed it before this request.',
      );

    for (const operation of [
      recordingPlayback,
      createRecordingUpload,
      refreshRecordingUpload,
      completeRecordingUpload,
    ]) {
      for (const status of ['400', '404', '409']) {
        expect(operation.responses[status].content['application/json'].schema)
          .toEqual({
            $ref: '#/components/schemas/ApiErrorResponseDto',
          });
      }
    }

    expect(document.components.securitySchemes).toMatchObject({
      jwt: expect.objectContaining({
        type: 'apiKey',
        in: 'cookie',
        name: 'jwt',
      }),
      internalBearer: expect.objectContaining({
        type: 'http',
        scheme: 'bearer',
      }),
    });

    expect(document.components.securitySchemes.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });

    expect(paths['/jobs'].get.security).toContainEqual({ jwt: [] });
    expect(paths['/jobs'].get.security).toContainEqual({ bearer: [] });

    expect(paths['/jobs'].post.security).toEqual(
      expect.arrayContaining([{ jwt: [] }, { bearer: [] }]),
    );

    expect(paths['/calls/{callId}/recording'].get.security).toEqual(
      expect.arrayContaining([{ jwt: [] }, { bearer: [] }]),
    );

    expect(paths['/calls/{callId}/recording-upload'].post.security).toEqual(
      expect.arrayContaining([{ jwt: [] }, { bearer: [] }]),
    );

    expect(paths['/internal/media-sessions/authorize'].post.security)
      .toContainEqual({ internalBearer: [] });

    const limitParameter = paths['/jobs'].get.parameters.find(
      (parameter: { name: string }) => parameter.name === 'limit',
    );
    expect(limitParameter).toMatchObject({
      in: 'query',
      required: false,
      schema: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 50,
        example: 50,
      },
    });

    const schemas = document.components.schemas;
    expect(schemas.ApiErrorResponseDto.properties.message.oneOf).toHaveLength(2);
    expect(schemas.JobStatusResponseDto.properties.createdAt.format).toBe('date-time');
    expect(schemas.JobStatusResponseDto.properties.updatedAt.format).toBe('date-time');
    expect(schemas.RecordingTrackPlaybackResponseDto.properties.contentType.enum)
      .toEqual(['audio/wav']);
    expect(schemas.RecordingPlaybackResponseDto.properties.status.enum)
      .toEqual(['READY']);
    expect(schemas.AuthorizeMediaSessionResponseDto.properties.peerId).toMatchObject({
      pattern: '^[0-9a-fA-F]{24}$',
      minLength: 24,
      maxLength: 24,
    });
  });


  it('should return a consistent JSON response for an unknown route', async () => {
    const response = await request(app.getHttpServer())
      .get('/this-route-does-not-exist')
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      path: '/this-route-does-not-exist',
      message: 'Cannot GET /this-route-does-not-exist',
      error: 'Not Found',
    });

    expect(response.body.timestamp).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
  });


  it('POST /graphql should execute the hello query', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: 'query { hello }',
      })
      .expect(200);

    expect(response.body).toEqual({
      data: {
        hello: 'Hello from GraphQL!',
      },
    });
  });
  it('should reject a GraphQL query that requests an unknown field', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: 'query { fieldThatDoesNotExist }',
      })
      .expect(400);

    // GraphQL validation errors should follow the GraphQL response contract.
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'Cannot query field',
          ),
        }),
      ]),
    );

    // A query rejected during validation must not return successful data.
    expect(response.body.data).toBeUndefined();
  });

  it('should reject a GraphQL query with invalid syntax', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: 'query { hello ',
      })
      .expect(400);

    // Parsing failures should return a useful client-facing error.
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.any(String),
        }),
      ]),
    );

    expect(response.body.data).toBeUndefined();
  });


  // Verify that DTO validation rejects malformed identifiers before
  // the resolver can pass untrusted input to the service layer.
  it('should reject a message mutation with an invalid conversation UUID', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          mutation {
            createMessage(
              input: {
                conversationId: "not-a-uuid"
                text: "Hello"
              }
            ) {
              id
            }
          }
        `,
      });

    // GraphQL resolver errors may use HTTP 200, so assert the GraphQL
    // response contract and validation failure rather than HTTP status alone.
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("UUID"),
        }),
      ]),
    );

    // Invalid input must not produce a successful mutation result.
    expect(response.body.data?.createMessage).toBeUndefined();
  });


  // Keep pagination requests within the DTO's documented upper bound.
  it('should reject a message query with a limit greater than 100', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          query {
            conversationMessages(
              input: {
                conversationId: "00000000-0000-4000-8000-000000000001"
                limit: 101
              }
            ) {
              items {
                id
              }
            }
          }
        `,
      });

    // GraphQL can return HTTP 200 even when resolver argument validation fails.
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('100'),
        }),
      ]),
    );

    // A rejected pagination request must not return successful query data.
    expect(response.body.data?.conversationMessages).toBeUndefined();
  });


  // Prevent zero-sized pages, which do not provide useful pagination results.
  it('should reject a message query with a limit below 1', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          query {
            conversationMessages(
              input: {
                conversationId: "00000000-0000-4000-8000-000000000001"
                limit: 0
              }
            ) {
              items {
                id
              }
            }
          }
        `,
      });

    // Assert the validation error rather than relying on HTTP status alone.
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('1'),
        }),
      ]),
    );

    // Invalid pagination input must not return successful query data.
    expect(response.body.data?.conversationMessages).toBeUndefined();
  });
});
