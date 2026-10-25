/** Authorization and persistence for call sessions and call history. */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  CallParticipantStatus as PrismaParticipantStatus,
  CallStatus as PrismaCallStatus,
  CallType as PrismaCallType,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CallEventsPublisher } from './call-events.publisher.js';
import type {
  CallActionInput,
  CallHistoryInput,
  CreateCallInput,
} from './call.types.js';

const callInclude = {
  participants: {
    orderBy: { invitedAt: 'asc' as const },
  },
};

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly callEventsPublisher?: CallEventsPublisher,
  ) {}

  async create(input: CreateCallInput, actorId: string) {
    const actor = actorId.toLowerCase();

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: input.conversationId,
        participants: { some: { userId: actor } },
      },
      select: {
        id: true,
        participants: { select: { userId: true } },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const conversationUserIds = conversation.participants.map((participant) =>
      participant.userId.toLowerCase(),
    );

    const requestedIds = input.participantIds?.map((id) => id.toLowerCase());

    const invitees =
      requestedIds ?? conversationUserIds.filter((userId) => userId !== actor);

    if (invitees.length === 0) {
      throw new BadRequestException(
        'A call requires at least one other participant',
      );
    }

    if (invitees.length > 49) {
      throw new BadRequestException(
        'A call can invite at most 49 other participants',
      );
    }

    if (new Set(invitees).size !== invitees.length) {
      throw new BadRequestException(
        'Call participants must not contain duplicates',
      );
    }

    if (invitees.includes(actor)) {
      throw new BadRequestException(
        'The call initiator cannot be invited as another participant',
      );
    }

    const allowedIds = new Set(conversationUserIds);
    if (invitees.some((userId) => !allowedIds.has(userId))) {
      throw new BadRequestException(
        'Every invitee must belong to this conversation',
      );
    }

    const now = new Date();

    const created = await this.prisma.callSession.create({
      data: {
        conversationId: conversation.id,
        initiatorId: actor,
        type: input.type as PrismaCallType,
        status: PrismaCallStatus.RINGING,
        participants: {
          create: [
            {
              userId: actor,
              status: PrismaParticipantStatus.ACCEPTED,
              respondedAt: now,
              joinedAt: now,
            },
            ...invitees.map((userId) => ({
              userId,
              status: PrismaParticipantStatus.INVITED,
            })),
          ],
        },
      },
      include: callInclude,
    });

    await this.publishCallEvent(created, 'invitation');
    return created;
  }

  async accept(input: CallActionInput, actorId: string) {
    const actor = actorId.toLowerCase();
    const call = await this.findAuthorizedCall(input.callId, actor);

    if (
      call.status !== PrismaCallStatus.RINGING &&
      call.status !== PrismaCallStatus.ACTIVE
    ) {
      throw new BadRequestException('This call is no longer accepting answers');
    }

    const participant = call.participants.find(
      (entry) => entry.userId.toLowerCase() === actor,
    );

    if (
      !participant ||
      (participant.status !== PrismaParticipantStatus.INVITED &&
        participant.status !== PrismaParticipantStatus.RINGING)
    ) {
      throw new BadRequestException(
        'You do not have a pending invitation to this call',
      );
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Conditional update prevents accepting a call that ended concurrently.
      const callUpdate = await tx.callSession.updateMany({
        where: {
          id: call.id,
          status: {
            in: [PrismaCallStatus.RINGING, PrismaCallStatus.ACTIVE],
          },
        },
        data: {
          status: PrismaCallStatus.ACTIVE,
          startedAt: call.startedAt ?? now,
          answeredAt: call.answeredAt ?? now,
        },
      });

      if (callUpdate.count !== 1) {
        throw new BadRequestException('This call has already ended');
      }

      const participantUpdate = await tx.callParticipant.updateMany({
        where: {
          callId: call.id,
          userId: actor,
          status: {
            in: [
              PrismaParticipantStatus.INVITED,
              PrismaParticipantStatus.RINGING,
            ],
          },
        },
        data: {
          status: PrismaParticipantStatus.ACCEPTED,
          respondedAt: now,
          joinedAt: now,
        },
      });

      if (participantUpdate.count !== 1) {
        throw new BadRequestException(
          'Your invitation has already been answered',
        );
      }
    });

    const updated = await this.findAuthorizedCall(call.id, actor);
    await this.publishCallEvent(updated, 'updated');
    return updated;
  }

  async decline(input: CallActionInput, actorId: string) {
    const actor = actorId.toLowerCase();
    const call = await this.findAuthorizedCall(input.callId, actor);

    if (
      call.status !== PrismaCallStatus.RINGING &&
      call.status !== PrismaCallStatus.ACTIVE
    ) {
      throw new BadRequestException('This call has already ended');
    }

    const participant = call.participants.find(
      (entry) => entry.userId.toLowerCase() === actor,
    );

    if (
      !participant ||
      (participant.status !== PrismaParticipantStatus.INVITED &&
        participant.status !== PrismaParticipantStatus.RINGING)
    ) {
      throw new BadRequestException(
        'You do not have a pending invitation to decline',
      );
    }

    const now = new Date();

    const result = await this.prisma.callParticipant.updateMany({
      where: {
        callId: call.id,
        userId: actor,
        status: {
          in: [
            PrismaParticipantStatus.INVITED,
            PrismaParticipantStatus.RINGING,
          ],
        },
      },
      data: {
        status: PrismaParticipantStatus.DECLINED,
        respondedAt: now,
      },
    });

    if (result.count !== 1) {
      throw new BadRequestException(
        'Your invitation has already been answered',
      );
    }

    const updated = await this.findAuthorizedCall(call.id, actor);
    await this.publishCallEvent(updated, 'updated');
    return updated;
  }

  async end(input: CallActionInput, actorId: string) {
    const actor = actorId.toLowerCase();
    const call = await this.findAuthorizedCall(input.callId, actor);

    const participant = call.participants.find(
      (entry) => entry.userId.toLowerCase() === actor,
    );

    if (!participant) {
      throw new NotFoundException('Call not found');
    }

    // Ending an already finished call is idempotent for authorized participants.
    if (
      call.status === PrismaCallStatus.ENDED ||
      call.status === PrismaCallStatus.CANCELLED
    ) {
      return call;
    }

    const now = new Date();
    const nextStatus =
      call.status === PrismaCallStatus.ACTIVE
        ? PrismaCallStatus.ENDED
        : PrismaCallStatus.CANCELLED;

    await this.prisma.$transaction(async (tx) => {
      const callUpdate = await tx.callSession.updateMany({
        where: {
          id: call.id,
          status: {
            in: [PrismaCallStatus.RINGING, PrismaCallStatus.ACTIVE],
          },
        },
        data: { status: nextStatus, endedAt: now },
      });

      if (callUpdate.count !== 1) {
        throw new BadRequestException(
          'The call changed state; refresh its status and try again',
        );
      }

      await tx.callParticipant.updateMany({
        where: {
          callId: call.id,
          status: PrismaParticipantStatus.ACCEPTED,
        },
        data: {
          status: PrismaParticipantStatus.LEFT,
          leftAt: now,
        },
      });

      // If an active call ends, outstanding invitations become missed calls.
      if (nextStatus === PrismaCallStatus.ENDED) {
        await tx.callParticipant.updateMany({
          where: {
            callId: call.id,
            status: {
              in: [
                PrismaParticipantStatus.INVITED,
                PrismaParticipantStatus.RINGING,
              ],
            },
          },
          data: {
            status: PrismaParticipantStatus.MISSED,
          },
        });
      }
    });

    const updated = await this.findAuthorizedCall(call.id, actor);
    await this.publishCallEvent(updated, 'updated');
    return updated;
  }

  private async publishCallEvent(
    call: {
      id: string;
      conversationId: string;
      initiatorId: string;
      type: PrismaCallType;
      status: PrismaCallStatus;
      createdAt: Date;
      participants: Array<{ userId: string }>;
    },
    eventType: 'invitation' | 'updated',
  ): Promise<void> {
    if (!this.callEventsPublisher) {
      return;
    }

    try {
      await this.callEventsPublisher.publish({
        eventType,
        callId: call.id,
        conversationId: call.conversationId,
        initiatorId: call.initiatorId,
        type: call.type,
        status: call.status,
        participantIds: [...new Set(call.participants.map((p) => p.userId))],
        createdAt: call.createdAt.toISOString(),
      });
    } catch {
      this.logger.warn('Call event publishing failed for call ' + call.id);
    }
  }

  async history(input: CallHistoryInput, actorId: string) {
    const actor = actorId.toLowerCase();
    const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);

    return this.prisma.callSession.findMany({
      where: {
        participants: { some: { userId: actor } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: callInclude,
    });
  }

  async getCall(input: CallActionInput, actorId: string) {
    return this.findAuthorizedCall(input.callId, actorId.toLowerCase());
  }

  private async findAuthorizedCall(callId: string, actor: string) {
    const call = await this.prisma.callSession.findFirst({
      where: {
        id: callId,
        participants: { some: { userId: actor } },
      },
      include: callInclude,
    });

    if (!call) {
      // Same response for a nonexistent call and a call the user cannot access.
      throw new NotFoundException('Call not found');
    }

    return call;
  }
}
