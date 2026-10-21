/** Tests for app e2e spec in the nest api. */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
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

    expect(response.body.info.title).toBe('Fullstack Chat API');
    expect(response.body.paths['/health']).toBeDefined();
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
