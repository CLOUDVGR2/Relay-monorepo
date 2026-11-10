import { Test } from '@nestjs/testing';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/configure-app.js';
import { AppModule } from '../src/app.module.js';
import { getConnectionToken } from '@nestjs/mongoose';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import type { Connection } from 'mongoose';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

describe('Call collaboration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let connection: Connection;
  let conversationId: string | undefined;

  const ownerId = new Types.ObjectId().toHexString();
  const memberId = new Types.ObjectId().toHexString();
  const outsiderId = new Types.ObjectId().toHexString();

  const secret = 'e2e-test-secret-that-is-at-least-32-characters';

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
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    configureApp(app);
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    connection = app.get<Connection>(getConnectionToken());
    prisma = app.get(PrismaService);

    await connection.collection('users').insertMany([
      { _id: new Types.ObjectId(ownerId) },
      { _id: new Types.ObjectId(memberId) },
      { _id: new Types.ObjectId(outsiderId) },
    ]);
  }, 30_000);

  afterAll(async () => {
    if (conversationId) {
      // Call sessions and their participants cascade from the conversation.
      await prisma.chatMessage.deleteMany({ where: { conversationId } });
      await prisma.conversation.deleteMany({ where: { id: conversationId } });
    }

    await connection.collection('users').deleteMany({
      _id: {
        $in: [
          new Types.ObjectId(ownerId),
          new Types.ObjectId(memberId),
          new Types.ObjectId(outsiderId),
        ],
      },
    });

    await app?.close();
  }, 30_000);

  it('records a declined invitation', async () => {
    const conversationResponse = await graphql(
      `
        mutation {
          createConversation(
            input: {
              participantIds: ["${memberId}"]
              name: "Declined call E2E"
            }
          ) {
            id
          }
        }
      `,
      ownerToken,
    ).expect(200);

    expect(conversationResponse.body.errors).toBeUndefined();
    const id = conversationResponse.body.data.createConversation.id as string;

    try {
      const createResponse = await graphql(
        `
          mutation {
            createCall(
              input: {
                conversationId: "${id}"
                type: AUDIO
                participantIds: ["${memberId}"]
              }
            ) {
              id
              status
            }
          }
        `,
        ownerToken,
      ).expect(200);

      expect(createResponse.body.errors).toBeUndefined();
      const callId = createResponse.body.data.createCall.id as string;

      const declineResponse = await graphql(
        `
          mutation {
            declineCall(input: { callId: "${callId}" }) {
              id
              status
              participants {
                userId
                status
              }
            }
          }
        `,
        memberToken,
      ).expect(200);

      expect(declineResponse.body.errors).toBeUndefined();
      expect(declineResponse.body.data.declineCall).toMatchObject({
        id: callId,
        status: 'RINGING',
      });
      expect(declineResponse.body.data.declineCall.participants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userId: ownerId,
            status: 'ACCEPTED',
          }),
          expect.objectContaining({
            userId: memberId,
            status: 'DECLINED',
          }),
        ]),
      );
    } finally {
      await prisma.chatMessage.deleteMany({ where: { conversationId: id } });
      await prisma.conversation.deleteMany({ where: { id } });
    }
  });

  it('cancels an unanswered call and records it in participant history', async () => {
    const conversationResponse = await graphql(
      `
        mutation {
          createConversation(
            input: {
              participantIds: ["${memberId}"]
              name: "Cancelled call E2E"
            }
          ) {
            id
          }
        }
      `,
      ownerToken,
    ).expect(200);

    expect(conversationResponse.body.errors).toBeUndefined();
    const id = conversationResponse.body.data.createConversation.id as string;

    try {
      const createResponse = await graphql(
        `
          mutation {
            createCall(
              input: {
                conversationId: "${id}"
                type: AUDIO
                participantIds: ["${memberId}"]
              }
            ) {
              id
              status
            }
          }
        `,
        ownerToken,
      ).expect(200);

      expect(createResponse.body.errors).toBeUndefined();
      const callId = createResponse.body.data.createCall.id as string;

      const cancelResponse = await graphql(
        `
          mutation {
            endCall(input: { callId: "${callId}" }) {
              id
              status
              endedAt
              participants {
                userId
                status
              }
            }
          }
        `,
        ownerToken,
      ).expect(200);

      expect(cancelResponse.body.errors).toBeUndefined();
      expect(cancelResponse.body.data.endCall).toMatchObject({
        id: callId,
        status: 'CANCELLED',
      });
      expect(cancelResponse.body.data.endCall.endedAt).toEqual(
        expect.any(String),
      );
      expect(cancelResponse.body.data.endCall.participants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userId: ownerId,
            status: 'LEFT',
          }),
          expect.objectContaining({
            userId: memberId,
            status: 'INVITED',
          }),
        ]),
      );

      const historyResponse = await graphql(
        `
          query {
            callHistory(input: { limit: 10 }) {
              id
              status
            }
          }
        `,
        memberToken,
      ).expect(200);

      expect(historyResponse.body.errors).toBeUndefined();
      expect(historyResponse.body.data.callHistory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: callId,
            status: 'CANCELLED',
          }),
        ]),
      );
    } finally {
      await prisma.chatMessage.deleteMany({ where: { conversationId: id } });
      await prisma.conversation.deleteMany({ where: { id } });
    }
  });

});
