/** Tests for conversations auth e2e spec in the nest api. */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { GqlAuthGuard } from '../src/auth/gql-auth.guard.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Conversations authentication (e2e)', () => {
  let app: INestApplication<App>;
  let connection: Connection;
  let prisma: PrismaService;
  let conversationId: string | undefined;

  const userObjectIds = [
    new Types.ObjectId(),
    new Types.ObjectId(),
    new Types.ObjectId(),
  ];

  const [ownerId, memberId, outsiderId] = userObjectIds.map((id) =>
    id.toHexString(),
  );

  const secret =
    'e2e-test-secret-that-is-at-least-32-characters';

  const tokenFor = (userId: string) =>
    jwt.sign({ userId }, secret, { algorithm: 'HS256' });

  const ownerToken = tokenFor(ownerId);
  const memberToken = tokenFor(memberId);
  const outsiderToken = tokenFor(outsiderId);

  function graphql(query: string, token?: string) {
    const req = request(app.getHttpServer()).post('/graphql');

    if (token) {
      req.set('Cookie', `jwt=${token}`);
    }

    return req.send({ query });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule =
      await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

    // Keep the real GqlAuthGuard: this suite must verify real authentication.
    app = moduleFixture.createNestApplication();

    // Match the cookie middleware used by the production HTTP bootstrap.
    app.use(cookieParser());
    configureApp(app);
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();

    connection = app.get<Connection>(getConnectionToken());
    prisma = app.get(PrismaService);

    // Insert only the three MongoDB identities created by this test.
    await connection.collection('users').insertMany(
      userObjectIds.map((_id) => ({ _id })),
    );
  });

  afterAll(async () => {
    try {
      if (prisma && conversationId) {
        await prisma.chatMessage.deleteMany({
          where: { conversationId },
        });

        await prisma.conversation.deleteMany({
          where: { id: conversationId },
        });
      }
    } finally {
      try {
        if (connection) {
          await connection.collection('users').deleteMany({
            _id: { $in: userObjectIds },
          });
        }
      } finally {
        if (app) {
          await app.close();
        }
      }
    }
  });

  it('rejects requests without a valid authentication cookie', async () => {
    const response = await graphql(`
      query {
        conversations {
          id
        }
      }
    `).expect(200);

    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Authentication required'),
        }),
      ]),
    );
    expect(response.body.data?.conversations).toBeUndefined();
  });

  it('creates conversations, paginates messages, and denies non-members', async () => {
    // The owner creates a conversation with the second test account.
    const createConversationResponse = await graphql(
      `
        mutation {
          createConversation(
            input: {
              participantIds: ["${memberId}"]
              name: "Authenticated E2E conversation"
            }
          ) {
            id
            participants {
              userId
              role
            }
          }
        }
      `,
      ownerToken,
    ).expect(200);

    expect(createConversationResponse.body.errors).toBeUndefined();

    const conversation =
      createConversationResponse.body.data.createConversation;

    expect(conversation.id).toEqual(expect.any(String));
    conversationId = conversation.id;

    expect(conversation.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: ownerId,
          role: 'ADMIN',
        }),
        expect.objectContaining({
          userId: memberId,
          role: 'MEMBER',
        }),
      ]),
    );

    // Send three messages using the authenticated owner's cookie.
    // The API must derive senderId from the verified JWT, not input.
    for (const text of ['first message', 'second message', 'third message']) {
      const response = await graphql(
        `
          mutation {
            createMessage(
              input: {
                conversationId: "${conversationId}"
                text: "${text}"
              }
            ) {
              id
              conversationId
              senderId
              text
            }
          }
        `,
        ownerToken,
      ).expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.createMessage).toMatchObject({
        conversationId,
        senderId: ownerId,
        text,
      });
    }

    // The first page contains two messages and signals that an older
    // page exists. Use its cursor to retrieve the remaining message.
    const firstPageResponse = await graphql(
      `
        query {
          conversationMessages(
            input: {
              conversationId: "${conversationId}"
              limit: 2
            }
          ) {
            items {
              id
              text
              senderId
            }
            nextCursor
            hasMore
          }
        }
      `,
      ownerToken,
    ).expect(200);

    expect(firstPageResponse.body.errors).toBeUndefined();

    const firstPage =
      firstPageResponse.body.data.conversationMessages;

    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(firstPage.items.every(
      (item: { senderId: string }) => item.senderId === ownerId,
    )).toBe(true);

    const secondPageResponse = await graphql(
      `
        query {
          conversationMessages(
            input: {
              conversationId: "${conversationId}"
              limit: 2
              before: "${firstPage.nextCursor}"
            }
          ) {
            items {
              id
              text
              senderId
            }
            nextCursor
            hasMore
          }
        }
      `,
      ownerToken,
    ).expect(200);

    expect(secondPageResponse.body.errors).toBeUndefined();

    const secondPage =
      secondPageResponse.body.data.conversationMessages;

    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toBeNull();

    const allItems = [...firstPage.items, ...secondPage.items];

    expect(new Set(allItems.map(
      (item: { id: string }) => item.id,
    )).size).toBe(3);

    expect(allItems.map(
      (item: { text: string }) => item.text,
    ).sort()).toEqual([
      'first message',
      'second message',
      'third message',
    ]);

    // The third account has a valid JWT and a real MongoDB account,
    // but is not a participant in this conversation.
    const outsiderResponse = await graphql(
      `
        query {
          conversationMessages(
            input: {
              conversationId: "${conversationId}"
              limit: 2
            }
          ) {
            items {
              id
              text
            }
          }
        }
      `,
      outsiderToken,
    ).expect(200);

    expect(outsiderResponse.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Conversation not found'),
        }),
      ]),
    );

    // GraphQL may omit the failed field or return null, depending on
    // how the resolver error is serialized. Either way, no messages leak.
    expect(
      outsiderResponse.body.data?.conversationMessages ?? null,
    ).toBeNull();
  });
});
