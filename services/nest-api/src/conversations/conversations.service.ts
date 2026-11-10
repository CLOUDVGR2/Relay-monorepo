/** Service-layer logic for conversations service in the Relay NestJS API. */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUserService } from '../auth/auth-user.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Own conversation business rules, participant authorization, and message persistence.
// Account identities live in MongoDB; conversations and messages live in PostgreSQL.
@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authUsers: AuthUserService,
  ) {}

  // Return visible conversations for the requesting account only.
  findAll(userId: string) {
    return this.prisma.conversation.findMany({
      where: {
        participants: {
          some: { userId: userId.toLowerCase(), hiddenAt: null },
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        participants: {
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
  }

  // Hide a conversation only for the authenticated participant.
  // Shared messages and other participants' visibility are preserved.
  async hideConversation(conversationId: string, userId: string) {
    const normalizedUserId = userId.toLowerCase();
    const membership = await this.prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId: normalizedUserId,
        hiddenAt: null,
      },
      select: { id: true },
    });

    if (!membership) {
      throw new NotFoundException('Conversation not found');
    }

    const result = await this.prisma.conversationParticipant.updateMany({
      where: {
        conversationId,
        userId: normalizedUserId,
        hiddenAt: null,
      },
      data: { hiddenAt: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException('Conversation not found');
    }

    return true;
  }

  // Create a conversation and its participant records atomically.
  // The authenticated creator is always included, even if omitted from input.
  async create(
    userId: string,
    participantIds: string[],
    name?: string | null,
    description?: string | null,
  ) {
    // Normalize MongoDB ObjectId strings before de-duplication and storage.
    const creatorId = userId.toLowerCase();

    const uniqueParticipantIds = [
      ...new Set([creatorId, ...participantIds].map((id) => id.toLowerCase())),
    ];

    // A group conversation must contain the creator and at least one other account.
    if (uniqueParticipantIds.length < 2) {
      throw new BadRequestException(
        'A conversation must include at least one other participant',
      );
    }

    // Confirm all requested accounts exist before writing PostgreSQL records.
    // This prevents conversations containing stale or fabricated account IDs.
    const existingIds =
      await this.authUsers.findExistingUserIds(uniqueParticipantIds);
    const existingIdSet = new Set(existingIds.map((id) => id.toLowerCase()));
    const hasMissingParticipant = uniqueParticipantIds.some(
      (id) => !existingIdSet.has(id),
    );

    if (hasMissingParticipant) {
      throw new BadRequestException(
        'One or more conversation participants do not exist',
      );
    }

    const conversationInclude = {
      participants: {
        orderBy: { joinedAt: 'asc' as const },
      },
    };

    const createConversation = (client: typeof this.prisma) =>
      client.conversation.create({
        data: {
          name,
          description,
          participants: {
            create: uniqueParticipantIds.map((participantId) => ({
              userId: participantId,
              role: participantId === creatorId ? 'ADMIN' : 'MEMBER',
            })),
          },
        },
        include: conversationInclude,
      });

    // Reuse existing unnamed direct conversations. The transaction-scoped
    // advisory lock serializes concurrent requests for the same normalized
    // pair, while requests for other pairs remain independent.
    if (
      uniqueParticipantIds.length === 2 &&
      name == null &&
      description == null
    ) {
      const [firstParticipantId, secondParticipantId] = [
        ...uniqueParticipantIds,
      ].sort();

      const lockKey = JSON.stringify([
        firstParticipantId,
        secondParticipantId,
      ]);

      return this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text
        `;

        const existingConversation = await tx.conversation.findFirst({
          where: {
            AND: [
              {
                participants: {
                  some: { userId: firstParticipantId },
                },
              },
              {
                participants: {
                  some: { userId: secondParticipantId },
                },
              },
              {
                participants: {
                  every: {
                    userId: { in: uniqueParticipantIds },
                  },
                },
              },
            ],
          },
          orderBy: { createdAt: 'desc' },
          include: conversationInclude,
        });

        if (existingConversation) {
          await tx.conversationParticipant.updateMany({
            where: {
              conversationId: existingConversation.id,
              userId: creatorId,
            },
            data: { hiddenAt: null },
          });

          return { ...existingConversation, created: false };
        }

        return {
          ...(await createConversation(tx as typeof this.prisma)),
          created: true,
        };
      });
    }

    // Named conversations and groups are newly created here.
    return createConversation(this.prisma).then((conversation) => ({
      ...conversation,
      created: true,
    }));

  }

  // Update only supplied metadata fields, and only when the actor is an admin.
  async updateDetails(
    conversationId: string,
    actorId: string,
    name?: string | null,
    description?: string | null,
  ) {
    if (name === undefined && description === undefined) {
      throw new BadRequestException(
        "Provide a name or description to update",
      );
    }

    const actor = actorId.toLowerCase();
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: { userId: actor, role: "ADMIN" },
        },
      },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException(
        "Conversation not found or admin permission required",
      );
    }

    const data: { name?: string | null; description?: string | null } = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data,
      include: {
        participants: { orderBy: { joinedAt: "asc" } },
      },
    });
  }

  // Add new members only when the requesting user is a conversation admin.
  async addParticipants(
    conversationId: string,
    actorId: string,
    participantIds: string[],
  ) {
    const actor = actorId.toLowerCase();

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: { userId: actor, role: 'ADMIN' },
        },
      },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException(
        'Conversation not found or admin permission required',
      );
    }

    const requestedIds = [
      ...new Set(participantIds.map((id) => id.toLowerCase())),
    ];

    const existingIds =
      await this.authUsers.findExistingUserIds(requestedIds);
    const existingIdSet = new Set(existingIds.map((id) => id.toLowerCase()));

    if (requestedIds.some((id) => !existingIdSet.has(id))) {
      throw new BadRequestException(
        'One or more conversation participants do not exist',
      );
    }

    // PostgreSQL's unique constraint prevents duplicate memberships.
    // Existing members remain unchanged; new memberships always start as MEMBER.
    await this.prisma.conversationParticipant.createMany({
      data: requestedIds.map((participantId) => ({
        conversationId,
        userId: participantId,
        role: 'MEMBER' as const,
      })),
      skipDuplicates: true,
    });

    return this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: { orderBy: { joinedAt: 'asc' } },
      },
    });
  }

  // Load message history only when a GraphQL client explicitly requests it.
  // Membership is checked before reading messages to protect private conversations.
  async findAllMessages(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: { userId: userId.toLowerCase() },
        },
      },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  // Load one page of messages after confirming conversation membership.
  async findMessages(
    conversationId: string,
    userId: string,
    limit = 20,
    before?: string,
  ) {
    // Treat a missing conversation and a conversation the user cannot access
    // identically, preventing the endpoint from disclosing private conversation IDs.
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: { userId: userId.toLowerCase() },
        },
      },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Clamp page size even if this service is called outside GraphQL validation.
    const pageSize = Math.min(Math.max(Math.floor(limit), 1), 100);
    let cursorFilter = {};

    if (before) {
      // Resolve the cursor and ensure it belongs to the requested conversation.
      const cursor = await this.prisma.chatMessage.findUnique({
        where: { id: before },
        select: { id: true, conversationId: true, createdAt: true },
      });

      if (!cursor || cursor.conversationId !== conversationId) {
        throw new NotFoundException('Message cursor not found in conversation');
      }

      // Compare timestamp and ID together to keep ordering deterministic when
      // multiple messages share the same timestamp.
      cursorFilter = {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          {
            createdAt: cursor.createdAt,
            id: { lt: cursor.id },
          },
        ],
      };
    }

    // Fetch one extra record to determine whether older messages remain.
    const messages = await this.prisma.chatMessage.findMany({
      where: {
        conversationId,
        ...cursorFilter,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
    });

    const hasMore = messages.length > pageSize;

    // Remove the look-ahead record; it is only used to calculate hasMore.
    const page = messages.slice(0, pageSize);

    // The last record in the descending page is the cursor for older messages.
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    return {
      // Reverse the page so clients display messages oldest-first.
      items: page.reverse(),
      nextCursor,
      hasMore,
    };
  }

  // Persist a message only when the authenticated sender is a participant.
  async createMessage(conversationId: string, senderId: string, text: string) {
    // Check membership in the same query so non-members cannot post to a
    // conversation merely by knowing its UUID.
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: { userId: senderId.toLowerCase() },
        },
      },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Derive senderId from the verified request identity in the resolver.
    return this.prisma.chatMessage.create({
      data: {
        conversationId,
        senderId: senderId.toLowerCase(),
        text,
      },
    });
  }
}
