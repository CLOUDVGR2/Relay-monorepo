/** Authorization and persistence for call sessions and call history. */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CallAudioTrackKind,
  CallParticipantStatus as PrismaParticipantStatus,
  CallRecordingStatus,
  CallStatus as PrismaCallStatus,
  CallSummaryStatus,
  CallTranscriptStatus,
  CallType as PrismaCallType,
} from '../generated/prisma/enums.js';
import { AIService } from '../ai/ai.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CallSessionGetPayload } from '../generated/prisma/models.js';
import { CallEventsPublisher } from './call-events.publisher.js';
import type {
  AcceptCallInput,
  CallActionInput,
  CallHistoryInput,
  CreateCallInput,
} from './call.types.js';

const callInclude = {
  participants: {
    orderBy: { invitedAt: 'asc' as const },
  },
};

const callDetailsInclude = {
  ...callInclude,
  recording: {
    include: {
      tracks: {
        orderBy: { kind: 'asc' as const },
        include: { transcript: true },
      },
    },
  },
  summary: true,
};

type CallWithArtifacts = CallSessionGetPayload<{
  include: typeof callDetailsInclude;
}>;

type CallWithoutArtifacts = CallSessionGetPayload<{
  include: typeof callInclude;
}>;

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly callEventsPublisher?: CallEventsPublisher,
    @Optional() private readonly aiService?: AIService,
  ) {}

  async create(input: CreateCallInput, actorId: string) {
    if (input.type !== 'AUDIO') {
      throw new BadRequestException('Only audio calls are supported');
    }

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

    // Reuse a matching pending or active call so repeated requests
    // cannot create another invitation for the same conversation and media type.
    const activeCalls = await this.prisma.callSession.findMany({
      where: {
        conversationId: conversation.id,
        type: input.type as PrismaCallType,
        status: {
          in: [PrismaCallStatus.RINGING, PrismaCallStatus.ACTIVE],
        },
      },
      include: callInclude,
    });

    // Only one ringing or active call of each media type may exist
    // in a conversation. Repeated requests reuse it even if the
    // repeated request contains a different participant list.
    const existingCall = activeCalls[0];

    if (existingCall) {
      return { ...existingCall, created: false };
    }

    const now = new Date();

    let created;

    try {
      created = await this.prisma.callSession.create({
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
                recordingConsent: input.recordingConsent === true,
                recordingConsentAt: now,
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
    } catch (error) {
      // The partial unique index arbitrates concurrent create requests.
      // If another request won, return its open call instead of failing.
      const isUniqueConflict =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002';

      if (!isUniqueConflict) {
        throw error;
      }

      const concurrentCall = await this.prisma.callSession.findFirst({
        where: {
          conversationId: conversation.id,
          type: input.type as PrismaCallType,
          status: {
            in: [PrismaCallStatus.RINGING, PrismaCallStatus.ACTIVE],
          },
        },
        include: callInclude,
        orderBy: { createdAt: 'desc' },
      });

      if (!concurrentCall) {
        throw error;
      }

      return { ...concurrentCall, created: false };
    }

    const savedInitiator = created.participants.find(
      (participant) => participant.userId.toLowerCase() === actor,
    );

    console.info('[NEST][PASS] Initiator recording consent saved', {
      callId: created.id,
      recordingConsent: savedInitiator?.recordingConsent,
    });

    await this.publishCallEvent(created, 'invitation');
    return { ...created, created: true };
  }

  async accept(input: AcceptCallInput, actorId: string) {
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
          recordingConsent: input.recordingConsent === true,
          recordingConsentAt: now,
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
    const savedParticipant = updated.participants.find(
      (participant) => participant.userId.toLowerCase() === actor,
    );

    console.info('[NEST][PASS] Invitee recording consent saved', {
      callId: input.callId,
      userId: actor,
      recordingConsent: savedParticipant?.recordingConsent,
    });

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

  async deleteCallHistory(
    input: CallActionInput,
    actorId: string,
  ): Promise<boolean> {
    const actor = actorId.toLowerCase();
    const call = await this.findAuthorizedCall(input.callId, actor);

    if (call.initiatorId.toLowerCase() !== actor) {
      throw new BadRequestException(
        'Only the person who initiated the call can delete this invitation',
      );
    }

    if (call.status !== PrismaCallStatus.CANCELLED) {
      throw new BadRequestException(
        'Only cancelled invitations can be deleted from call history',
      );
    }

    // Soft-delete only this user's history entry. A zero count is acceptable:
    // it makes repeating the request idempotent without changing shared data.
    await this.prisma.callParticipant.updateMany({
      where: {
        callId: call.id,
        userId: actor,
        hiddenAt: null,
      },
      data: { hiddenAt: new Date() },
    });

    return true;
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
        participants: { some: { userId: actor, hiddenAt: null } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: callDetailsInclude,
    });
  }

  /**
   * Authorize signaling only for an active, accepted, two-person call.
   * Return the peer identity only; never expose the full call record.
   */
  async authorizeMediaSession(callId: string, actorId: string) {
    const actor = actorId.toLowerCase();
    const call = await this.findAuthorizedCall(callId, actor);

    const accepted = call.participants.filter(
      (participant) => participant.status === PrismaParticipantStatus.ACCEPTED,
    );

    if (
      call.status !== PrismaCallStatus.ACTIVE ||
      call.participants.length !== 2 ||
      accepted.length !== 2
    ) {
      throw new NotFoundException('Eligible media session not found');
    }

    const peer = accepted.find(
      (participant) => participant.userId.toLowerCase() !== actor,
    );

    if (!peer) {
      throw new NotFoundException('Eligible media session not found');
    }

    // Recording is opt-in and requires both accepted participants.
    const recordingAuthorized = accepted.every(
      (participant) => participant.recordingConsent === true,
    );

    console.info('[NEST][PASS] Recording authorization calculated', {
      callId,
      acceptedCount: accepted.length,
      consents: accepted.map((p) => ({
        userId: p.userId,
        consent: p.recordingConsent,
      })),
      recordingAuthorized,
    });

    if (recordingAuthorized) {
      // Both accepted participants may authorize signaling concurrently.
      // The unique callId constraint makes this initialization idempotent.
      await this.prisma.callRecording.upsert({
        where: { callId: call.id },
        create: { callId: call.id },
        update: {},
      });
    }

    return {
      callId: call.id,
      peerId: peer.userId,
      type: call.type,
      recordingAuthorized,
    };
  }

  async getCall(input: CallActionInput, actorId: string) {
    return this.findAuthorizedCall(input.callId, actorId.toLowerCase(), true);
  }

  async generateSummary(input: CallActionInput, actorId: string) {
    const actor = actorId.toLowerCase();
    const call = await this.findAuthorizedCall(input.callId, actor, true);

    if (call.status !== PrismaCallStatus.ENDED) {
      throw new BadRequestException(
        'A call must be ended before it can be summarized.',
      );
    }

    if (call.summary?.status === CallSummaryStatus.COMPLETED) {
      return call;
    }

    if (call.summary?.status === CallSummaryStatus.PROCESSING) {
      throw new BadRequestException(
        'A summary is already being generated for this call.',
      );
    }

    if (
      !call.recording ||
      call.recording.status !== CallRecordingStatus.READY
    ) {
      throw new BadRequestException(
        'The call recording is not ready for summarization.',
      );
    }

    const completedTracks = call.recording.tracks.filter(
      (track) =>
        track.transcript?.status === CallTranscriptStatus.COMPLETED &&
        !!track.transcript.text?.trim(),
    );

    if (completedTracks.length === 0) {
      throw new BadRequestException(
        'A completed transcript is required before a call can be summarized.',
      );
    }

    if (!this.aiService) {
      throw new ServiceUnavailableException(
        'Call summary generation is not configured.',
      );
    }

    await this.prisma.callSummary.upsert({
      where: { callId: call.id },
      create: {
        callId: call.id,
        status: CallSummaryStatus.PROCESSING,
      },
      update: {
        status: CallSummaryStatus.PROCESSING,
        failureCode: null,
      },
    });

    try {
      const analysis = await this.aiService.analyzeConversation(
        completedTracks.map((track) => ({
          sender:
            track.kind === CallAudioTrackKind.LOCAL_MICROPHONE
              ? 'You'
              : 'Other participant',
          text: track.transcript!.text!.trim(),
        })),
      );

      await this.prisma.callSummary.upsert({
        where: { callId: call.id },
        create: {
          callId: call.id,
          status: CallSummaryStatus.COMPLETED,
          summary: analysis.summary,
          keyPoints: analysis.decisions,
          actionItems: analysis.action_items,
          generatedAt: new Date(),
        },
        update: {
          status: CallSummaryStatus.COMPLETED,
          summary: analysis.summary,
          keyPoints: analysis.decisions,
          actionItems: analysis.action_items,
          failureCode: null,
          generatedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.callSummary.upsert({
        where: { callId: call.id },
        create: {
          callId: call.id,
          status: CallSummaryStatus.FAILED,
          failureCode: 'AI_ANALYSIS_FAILED',
        },
        update: {
          status: CallSummaryStatus.FAILED,
          failureCode: 'AI_ANALYSIS_FAILED',
        },
      });
      throw error;
    }

    return this.findAuthorizedCall(call.id, actor, true);
  }

  private findAuthorizedCall(
    callId: string,
    actor: string,
    includeArtifacts: true,
  ): Promise<CallWithArtifacts>;
  private findAuthorizedCall(
    callId: string,
    actor: string,
    includeArtifacts?: false,
  ): Promise<CallWithoutArtifacts>;
  private async findAuthorizedCall(
    callId: string,
    actor: string,
    includeArtifacts = false,
  ): Promise<CallWithArtifacts | CallWithoutArtifacts> {
    const call = await this.prisma.callSession.findFirst({
      where: {
        id: callId,
        participants: { some: { userId: actor } },
      },
      include: includeArtifacts ? callDetailsInclude : callInclude,
    });

    if (!call) {
      // Same response for a nonexistent call and a call the user cannot access.
      throw new NotFoundException('Call not found');
    }

    return call;
  }
}
