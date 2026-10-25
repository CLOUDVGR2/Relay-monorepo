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

  it('creates, accepts, ends, and authorizes a call session', async () => {
    const conversationResponse = await graphql(
      `
        mutation {
          createConversation(
            input: {
              participantIds: ["${memberId}"]
              name: "Call collaboration E2E"
            }
          ) {
            id
          }
        }
      `,
      ownerToken,
    ).expect(200);

    expect(conversationResponse.body.errors).toBeUndefined();

    conversationId = conversationResponse.body.data.createConversation.id;
    expect(conversationId).toEqual(expect.any(String));

    const createResponse = await graphql(
      `
        mutation {
          createCall(
            input: {
              conversationId: "${conversationId}"
              type: VIDEO
              participantIds: ["${memberId}"]
            }
          ) {
            id
            conversationId
            initiatorId
            type
            status
            participants {
              userId
              status
            }
          }
        }
      `,
      ownerToken,
    ).expect(200);

    expect(createResponse.body.errors).toBeUndefined();

    const created = createResponse.body.data.createCall;
    expect(created).toMatchObject({
      conversationId,
      initiatorId: ownerId,
      type: 'VIDEO',
      status: 'RINGING',
    });
    expect(created.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: ownerId, status: 'ACCEPTED' }),
        expect.objectContaining({ userId: memberId, status: 'INVITED' }),
      ]),
    );

    const callId = created.id as string;

    // A valid account outside the conversation must not access the call.
    const outsiderRead = await graphql(
      `
        query {
          callSession(input: { callId: "${callId}" }) {
            id
          }
        }
      `,
      outsiderToken,
    ).expect(200);

    expect(outsiderRead.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Call not found'),
        }),
      ]),
    );
    expect(outsiderRead.body.data?.callSession ?? null).toBeNull();

    // The invited member accepts the call.
    const acceptResponse = await graphql(
      `
        mutation {
          acceptCall(input: { callId: "${callId}" }) {
            id
            status
            answeredAt
            participants {
              userId
              status
            }
          }
        }
      `,
      memberToken,
    ).expect(200);

    expect(acceptResponse.body.errors).toBeUndefined();
    expect(acceptResponse.body.data.acceptCall).toMatchObject({
      id: callId,
      status: 'ACTIVE',
    });
    expect(acceptResponse.body.data.acceptCall.answeredAt).toEqual(
      expect.any(String),
    );

    // An outsider cannot end another user's call.
    const outsiderEnd = await graphql(
      `
        mutation {
          endCall(input: { callId: "${callId}" }) {
            id
          }
        }
      `,
      outsiderToken,
    ).expect(200);

    expect(outsiderEnd.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Call not found'),
        }),
      ]),
    );

    const endResponse = await graphql(
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

    expect(endResponse.body.errors).toBeUndefined();
    expect(endResponse.body.data.endCall).toMatchObject({
      id: callId,
      status: 'ENDED',
    });
    expect(endResponse.body.data.endCall.endedAt).toEqual(
      expect.any(String),
    );
    expect(endResponse.body.data.endCall.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: ownerId, status: 'LEFT' }),
        expect.objectContaining({ userId: memberId, status: 'LEFT' }),
      ]),
    );

    // The call should be visible in history to its participant.
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
        expect.objectContaining({ id: callId, status: 'ENDED' }),
      ]),
    );
  });

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
