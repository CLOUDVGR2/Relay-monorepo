import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CallParticipantStatus,
  CallStatus,
  CallType,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CallsService } from './calls.service.js';
import { CallEventsPublisher } from './call-events.publisher.js';

describe('CallsService', () => {
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const callId = '22222222-2222-4222-8222-222222222222';
  const actorId = '507f1f77bcf86cd799439011';
  const inviteeId = '507f191e810c19729de860ea';

  const pendingCall = () => ({
    id: callId,
    conversationId,
    initiatorId: actorId,
    type: CallType.AUDIO,
    status: CallStatus.RINGING,
    startedAt: null,
    answeredAt: null,
    endedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    participants: [
      {
        id: 'participant-1',
        userId: actorId,
        status: CallParticipantStatus.ACCEPTED,
        invitedAt: new Date(),
        respondedAt: new Date(),
        joinedAt: new Date(),
        leftAt: null,
      },
      {
        id: 'participant-2',
        userId: inviteeId,
        status: CallParticipantStatus.INVITED,
        invitedAt: new Date(),
        respondedAt: null,
        joinedAt: null,
        leftAt: null,
      },
    ],
  });

  const tx = {
    callSession: { updateMany: vi.fn() },
    callParticipant: { updateMany: vi.fn() },
  };

  const prisma = {
    conversation: { findFirst: vi.fn() },
    callSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    callParticipant: { updateMany: vi.fn() },
    callRecording: { upsert: vi.fn() },
    $transaction: vi.fn(),
  };

  const publisher = {
    publish: vi.fn(),
  };

  let service: CallsService;

  beforeEach(() => {
    vi.resetAllMocks();

    service = new CallsService(
      prisma as unknown as PrismaService,
      publisher as unknown as CallEventsPublisher,
    );

    prisma.conversation.findFirst.mockResolvedValue({
      id: conversationId,
      participants: [{ userId: actorId }, { userId: inviteeId }],
    });

    prisma.callSession.findFirst.mockResolvedValue(pendingCall());

    prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );

    tx.callSession.updateMany.mockResolvedValue({ count: 1 });
    tx.callParticipant.updateMany.mockResolvedValue({ count: 1 });
    prisma.callParticipant.updateMany.mockResolvedValue({ count: 1 });
    prisma.callRecording.upsert.mockResolvedValue({
      id: 'recording-1',
      callId,
    });
  });

  describe('create', () => {
    it('rejects video calls before accessing the database', async () => {
      await expect(
        service.create(
          {
            conversationId,
            type: 'VIDEO' as never,
            participantIds: [inviteeId],
          },
          actorId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.conversation.findFirst).not.toHaveBeenCalled();
      expect(prisma.callSession.findMany).not.toHaveBeenCalled();
      expect(prisma.callSession.create).not.toHaveBeenCalled();
    });

    beforeEach(() => {
      // Creation tests start without an existing call. Other service tests
      // continue using the default pending-call mock.
      prisma.callSession.findMany.mockResolvedValue([]);
    });

    it.each([CallType.AUDIO])(
      'reuses an existing %s call instead of sending another invitation',
      async (type) => {
        const existing = pendingCall();
        existing.type = type;
        existing.status = CallStatus.RINGING;
        prisma.callSession.findMany.mockResolvedValue([existing]);

        await expect(
          service.create(
            { conversationId, type, participantIds: [inviteeId] },
            actorId,
          ),
        ).resolves.toEqual({ ...existing, created: false });

        expect(prisma.callSession.findMany).toHaveBeenCalledWith({
          where: {
            conversationId,
            type,
            status: {
              in: [CallStatus.RINGING, CallStatus.ACTIVE],
            },
          },
          include: {
            participants: { orderBy: { invitedAt: 'asc' } },
          },
        });
        expect(prisma.callSession.create).not.toHaveBeenCalled();
        expect(publisher.publish).not.toHaveBeenCalled();
      },
    );

    it('reuses an open call even when the repeated request has different participants', async () => {
      const existing = pendingCall();
      existing.type = CallType.AUDIO;
      existing.participants = [
        existing.participants[0],
        {
          ...existing.participants[1],
          userId: '507f191e810c19729de860eb',
        },
      ];
      prisma.callSession.findMany.mockResolvedValue([existing]);

      await expect(
        service.create(
          { conversationId, type: CallType.AUDIO, participantIds: [inviteeId] },
          actorId,
        ),
      ).resolves.toEqual({ ...existing, created: false });

      expect(prisma.callSession.create).not.toHaveBeenCalled();
      expect(publisher.publish).not.toHaveBeenCalled();
    });

    it('creates a new call when no matching active call exists', async () => {
      const created = pendingCall();
      prisma.callSession.findMany.mockResolvedValue([]);
      prisma.callSession.create.mockResolvedValue(created);

      await expect(
        service.create(
          { conversationId, type: 'AUDIO', participantIds: [inviteeId] },
          actorId,
        ),
      ).resolves.toEqual({ ...created, created: true });

      expect(prisma.callSession.create).toHaveBeenCalledOnce();
      expect(publisher.publish).toHaveBeenCalledOnce();
    });

    it('does not fail call creation if event publishing rejects', async () => {
      const created = pendingCall();
      prisma.callSession.create.mockResolvedValue(created);
      publisher.publish.mockRejectedValueOnce(new Error('Express unavailable'));

      await expect(
        service.create(
          { conversationId, type: 'AUDIO', participantIds: [inviteeId] },
          actorId,
        ),
      ).resolves.toEqual({ ...created, created: true });
    });

    it('creates a call with normalized initiator and invitee IDs', async () => {
      const created = pendingCall();
      prisma.callSession.create.mockResolvedValue(created);

      await expect(
        service.create(
          {
            conversationId,
            type: 'AUDIO',
            participantIds: [inviteeId.toUpperCase()],
          },
          actorId.toUpperCase(),
        ),
      ).resolves.toEqual({ ...created, created: true });

      expect(publisher.publish).toHaveBeenCalledWith({
        eventType: 'invitation',
        callId,
        conversationId,
        initiatorId: actorId,
        type: CallType.AUDIO,
        status: CallStatus.RINGING,
        participantIds: [actorId, inviteeId],
        createdAt: created.createdAt.toISOString(),
      });

      expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          id: conversationId,
          participants: { some: { userId: actorId } },
        },
        select: {
          id: true,
          participants: { select: { userId: true } },
        },
      });

      expect(prisma.callSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId,
            initiatorId: actorId,
            type: CallType.AUDIO,
            status: CallStatus.RINGING,
            participants: {
              create: expect.arrayContaining([
                expect.objectContaining({
                  userId: actorId,
                  status: CallParticipantStatus.ACCEPTED,
                }),
                expect.objectContaining({
                  userId: inviteeId,
                  status: CallParticipantStatus.INVITED,
                }),
              ]),
            },
          }),
        }),
      );
    });

    it('rejects a caller who is not a conversation member', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.create({ conversationId, type: 'AUDIO' }, actorId),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.callSession.create).not.toHaveBeenCalled();
    });

    it('rejects invitees who are not conversation members', async () => {
      await expect(
        service.create(
          {
            conversationId,
            type: 'AUDIO',
            participantIds: ['507f1f77bcf86cd799439012'],
          },
          actorId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.callSession.create).not.toHaveBeenCalled();
    });

    it('rejects a call without another participant', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        id: conversationId,
        participants: [{ userId: actorId }],
      });

      await expect(
        service.create({ conversationId, type: 'AUDIO' }, actorId),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.callSession.create).not.toHaveBeenCalled();
    });
  });

  describe('accept', () => {
    it('accepts only the authenticated participant and updates call state transactionally', async () => {
      const call = pendingCall();
      prisma.callSession.findFirst.mockResolvedValue(call);

      await service.accept({ callId }, inviteeId.toUpperCase());

      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(tx.callSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: callId,
            status: { in: [CallStatus.RINGING, CallStatus.ACTIVE] },
          },
          data: expect.objectContaining({ status: CallStatus.ACTIVE }),
        }),
      );
      expect(tx.callParticipant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            callId,
            userId: inviteeId,
            status: {
              in: [
                CallParticipantStatus.INVITED,
                CallParticipantStatus.RINGING,
              ],
            },
          }),
          data: expect.objectContaining({
            status: CallParticipantStatus.ACCEPTED,
          }),
        }),
      );
    });

    it('rejects accepting a call the user cannot access', async () => {
      prisma.callSession.findFirst.mockResolvedValue(null);

      await expect(
        service.accept({ callId }, '507f1f77bcf86cd799439012'),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects accepting an invitation that has already been answered', async () => {
      const call = pendingCall();
      call.participants[1].status = CallParticipantStatus.DECLINED;
      prisma.callSession.findFirst.mockResolvedValue(call);

      await expect(service.accept({ callId }, inviteeId)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an accept if the call ended concurrently', async () => {
      tx.callSession.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.accept({ callId }, inviteeId)).rejects.toThrow(
        BadRequestException,
      );

      expect(tx.callParticipant.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('decline', () => {
    it('declines only the authenticated participant invitation', async () => {
      await service.decline({ callId }, inviteeId.toUpperCase());

      expect(prisma.callParticipant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            callId,
            userId: inviteeId,
          }),
          data: expect.objectContaining({
            status: CallParticipantStatus.DECLINED,
          }),
        }),
      );
    });

    it('rejects a second decline after the invitation was answered', async () => {
      prisma.callParticipant.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.decline({ callId }, inviteeId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('end', () => {
    it('ends an active call and marks accepted participants as left', async () => {
      const call = pendingCall();
      call.status = CallStatus.ACTIVE;
      prisma.callSession.findFirst.mockResolvedValue(call);

      await service.end({ callId }, actorId);

      expect(tx.callSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: callId,
            status: { in: [CallStatus.RINGING, CallStatus.ACTIVE] },
          },
          data: expect.objectContaining({
            status: CallStatus.ENDED,
            endedAt: expect.any(Date),
          }),
        }),
      );

      expect(tx.callParticipant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            callId,
            status: CallParticipantStatus.ACCEPTED,
          },
          data: expect.objectContaining({
            status: CallParticipantStatus.LEFT,
          }),
        }),
      );
    });

    it('cancels a ringing call and does not mark it as an ended call', async () => {
      await service.end({ callId }, actorId);

      expect(tx.callSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: CallStatus.CANCELLED }),
        }),
      );
    });

    it('does not expose calls to non-participants', async () => {
      prisma.callSession.findFirst.mockResolvedValue(null);

      await expect(
        service.end({ callId }, '507f1f77bcf86cd799439012'),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('deleteCallHistory', () => {
    it('hides a cancelled invitation only for its initiator', async () => {
      const call = pendingCall();
      call.status = CallStatus.CANCELLED;
      prisma.callSession.findFirst.mockResolvedValue(call);

      await expect(service.deleteCallHistory({ callId }, actorId)).resolves.toBe(true);

      expect(prisma.callParticipant.updateMany).toHaveBeenCalledWith({
        where: { callId, userId: actorId, hiddenAt: null },
        data: { hiddenAt: expect.any(Date) },
      });
      expect(prisma.callSession.updateMany).not.toHaveBeenCalled();
    });

    it('rejects deletion by a participant who did not initiate the call', async () => {
      const call = pendingCall();
      call.status = CallStatus.CANCELLED;
      prisma.callSession.findFirst.mockResolvedValue(call);

      await expect(
        service.deleteCallHistory({ callId }, inviteeId),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.callParticipant.updateMany).not.toHaveBeenCalled();
    });

    it('rejects deletion before the invitation is cancelled', async () => {
      await expect(
        service.deleteCallHistory({ callId }, actorId),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.callParticipant.updateMany).not.toHaveBeenCalled();
    });

    it('treats an already-hidden invitation as successfully deleted', async () => {
      const call = pendingCall();
      call.status = CallStatus.CANCELLED;
      prisma.callSession.findFirst.mockResolvedValue(call);
      prisma.callParticipant.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.deleteCallHistory({ callId }, actorId)).resolves.toBe(true);
    });
  });

  describe('authorizeMediaSession', () => {
    const activeOneToOneCall = () => {
      const call = pendingCall();
      call.status = CallStatus.ACTIVE;
      call.participants[1].status = CallParticipantStatus.ACCEPTED;
      call.participants.forEach((participant) => {
        participant.recordingConsent = true;
        participant.recordingConsentAt = new Date();
      });
      return call;
    };

    it('authorizes an accepted participant and returns recording authorization', async () => {
      const call = activeOneToOneCall();
      prisma.callSession.findFirst.mockResolvedValue(call);

      await expect(
        service.authorizeMediaSession(callId, actorId.toUpperCase()),
      ).resolves.toEqual({
        callId,
        peerId: inviteeId,
        type: CallType.AUDIO,
        recordingAuthorized: true,
      });

      expect(prisma.callSession.findFirst).toHaveBeenCalledWith({
        where: {
          id: callId,
          participants: { some: { userId: actorId } },
        },
        include: {
          participants: { orderBy: { invitedAt: 'asc' } },
        },
      });

      expect(prisma.callRecording.upsert).toHaveBeenCalledWith({
        where: { callId },
        create: { callId },
        update: {},
      });
    });

    it('does not authorize recording when either participant has not consented', async () => {
      const call = activeOneToOneCall();
      call.participants[1].recordingConsent = false;
      prisma.callSession.findFirst.mockResolvedValue(call);

      await expect(
        service.authorizeMediaSession(callId, actorId),
      ).resolves.toEqual({
        callId,
        peerId: inviteeId,
        type: CallType.AUDIO,
        recordingAuthorized: false,
      });

      expect(prisma.callRecording.upsert).not.toHaveBeenCalled();
    });

    it('rejects a call that is still ringing', async () => {
      prisma.callSession.findFirst.mockResolvedValue(pendingCall());

      await expect(
        service.authorizeMediaSession(callId, actorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an ended call', async () => {
      const call = activeOneToOneCall();
      call.status = CallStatus.ENDED;
      prisma.callSession.findFirst.mockResolvedValue(call);

      await expect(
        service.authorizeMediaSession(callId, actorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a group call even when every participant has accepted', async () => {
      const call = activeOneToOneCall();
      call.participants.push({
        ...call.participants[1],
        id: 'participant-3',
        userId: '507f1f77bcf86cd799439012',
      });
      prisma.callSession.findFirst.mockResolvedValue(call);

      await expect(
        service.authorizeMediaSession(callId, actorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a user who is not a call participant', async () => {
      prisma.callSession.findFirst.mockResolvedValue(null);

      await expect(
        service.authorizeMediaSession(
          callId,
          '507f1f77bcf86cd799439012',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('history', () => {
    it('returns only calls involving the authenticated user with a bounded limit', async () => {
      const calls = [pendingCall()];
      prisma.callSession.findMany.mockResolvedValue(calls);

      await expect(
        service.history({ limit: 500 }, actorId.toUpperCase()),
      ).resolves.toEqual(calls);

      expect(prisma.callSession.findMany).toHaveBeenCalledWith({
        where: {
          participants: { some: { userId: actorId, hiddenAt: null } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
        include: {
          participants: { orderBy: { invitedAt: 'asc' } },
          recording: {
            include: {
              tracks: {
                orderBy: { kind: 'asc' },
                include: { transcript: true },
              },
            },
          },
          summary: true,
        },
      });
    });
  });
});
