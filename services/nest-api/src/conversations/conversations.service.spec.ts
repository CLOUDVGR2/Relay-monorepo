/** Tests for conversations service spec in the nest api. */

import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationsService } from './conversations.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthUserService } from '../auth/auth-user.service.js';

// Group all unit tests for the ConversationsService.
describe('ConversationsService', () => {
  // Mock the Prisma methods used by the service.
  // These mocks prevent the tests from connecting to a real database.
  const prisma = {
    conversation: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    conversationParticipant: {
      createMany: vi.fn(),
    },
    chatMessage: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };

  const authUsers = { findExistingUserIds: vi.fn() };
  const userId = 'user-1';
  let service: ConversationsService;

  // Reset mock history and create a fresh service before each test.
  beforeEach(() => {
    vi.resetAllMocks();

    // Inject the mocked Prisma client into the service.
    authUsers.findExistingUserIds.mockImplementation(async (ids: string[]) => ids);
    service = new ConversationsService(
      prisma as unknown as PrismaService,
      authUsers as unknown as AuthUserService,
    );
  });

  // Test retrieving all conversations and their messages.
  describe('findAll', () => {
    it('should retrieve conversations without eagerly loading messages', async () => {
      const conversations = [
        {
          id: 'conversation-1',
        },
      ];

      // Tell the mock what data Prisma should return.
      prisma.conversation.findMany.mockResolvedValue(conversations);

      // Verify that the service returns the conversations from Prisma.
      await expect(service.findAll(userId)).resolves.toEqual(conversations);

      // Verify only participants are included in the conversation list.
      expect(prisma.conversation.findMany).toHaveBeenCalledWith({
        where: { participants: { some: { userId } } },
        orderBy: { createdAt: 'desc' },
        include: {
          participants: {
            orderBy: { joinedAt: 'asc' },
          },
        },
      });
    });
  });

  // Test creating a conversation.
  describe('create', () => {
    it('should create a conversation without eagerly loading messages', async () => {
      const conversation = {
        id: 'conversation-1',
      };

      // Simulate Prisma returning the newly created conversation.
      prisma.conversation.create.mockResolvedValue(conversation);

      // Verify the service returns the created conversation.
      await expect(service.create(userId, ['user-2'])).resolves.toEqual(conversation);

      // Verify Prisma creates the conversation and includes participants only.
      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: {
          participants: {
            create: [
              { userId: 'user-1', role: 'ADMIN' },
              { userId: 'user-2', role: 'MEMBER' },
            ],
          },
        },
        include: {
          participants: {
            orderBy: { joinedAt: 'asc' },
          },
        },
      });
    });
  });

  describe('addParticipants', () => {
    const conversationId = 'conversation-1';
    const adminId = 'admin-1';

    beforeEach(() => {
      prisma.conversation.findFirst.mockResolvedValue({
        id: conversationId,
      });
      prisma.conversation.findUnique.mockResolvedValue({
        id: conversationId,
        participants: [],
        messages: [],
      });
    });

    it('should reject users who are not conversation admins', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.addParticipants(conversationId, userId, ['user-2']),
      ).rejects.toThrow(NotFoundException);

      expect(authUsers.findExistingUserIds).not.toHaveBeenCalled();
      expect(prisma.conversationParticipant.createMany).not.toHaveBeenCalled();
    });

    it('should reject participant IDs that do not belong to existing accounts', async () => {
      authUsers.findExistingUserIds.mockResolvedValue([]);

      await expect(
        service.addParticipants(conversationId, adminId, ['missing-user']),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.conversationParticipant.createMany).not.toHaveBeenCalled();
    });

    it('should normalize and deduplicate IDs and add members safely', async () => {
      const updatedConversation = {
        id: conversationId,
        participants: [
          { userId: adminId, role: 'ADMIN' },
          { userId: 'user-2', role: 'MEMBER' },
        ],
        messages: [],
      };

      prisma.conversation.findUnique.mockResolvedValue(updatedConversation);

      await expect(
        service.addParticipants(conversationId, adminId, [
          'USER-2',
          'user-2',
        ]),
      ).resolves.toEqual(updatedConversation);

      expect(authUsers.findExistingUserIds).toHaveBeenCalledWith(['user-2']);

      expect(prisma.conversationParticipant.createMany).toHaveBeenCalledWith({
        data: [
          {
            conversationId,
            userId: 'user-2',
            role: 'MEMBER',
          },
        ],
        skipDuplicates: true,
      });

      expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { id: conversationId },
        include: {
          participants: { orderBy: { joinedAt: 'asc' } },
        },
      });
    });
  });

  describe('findAllMessages', () => {
    it('should verify membership before loading messages in chronological order', async () => {
      const messages = [
        { id: 'message-1', conversationId: 'conversation-1', text: 'Hello' },
      ];

      prisma.conversation.findFirst.mockResolvedValue({ id: 'conversation-1' });
      prisma.chatMessage.findMany.mockResolvedValue(messages);

      await expect(
        service.findAllMessages('conversation-1', userId),
      ).resolves.toEqual(messages);

      expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'conversation-1',
          participants: { some: { userId: 'user-1' } },
        },
        select: { id: true },
      });

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: { conversationId: 'conversation-1' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
    });

    it('should not load messages when the user is not a conversation participant', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.findAllMessages('conversation-1', userId),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findMessagesForSummary', () => {
    it('checks membership and returns a bounded history chronologically', async () => {
      const newestFirst = [
        { id: 'message-2', text: 'Second' },
        { id: 'message-1', text: 'First' },
      ];
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conversation-1' });
      prisma.chatMessage.findMany.mockResolvedValue(newestFirst);

      await expect(
        service.findMessagesForSummary('conversation-1', userId, 2),
      ).resolves.toEqual([
        { id: 'message-1', text: 'First' },
        { id: 'message-2', text: 'Second' },
      ]);

      expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'conversation-1',
          participants: { some: { userId: 'user-1' } },
        },
        select: { id: true },
      });
      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: { conversationId: 'conversation-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 2,
      });
    });

    it('caps the history at 100 messages', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conversation-1' });
      prisma.chatMessage.findMany.mockResolvedValue([]);

      await service.findMessagesForSummary('conversation-1', userId, 500);

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('does not load messages for a non-participant', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.findMessagesForSummary('conversation-1', userId),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
    });
  });

  // Test retrieving messages from a conversation in pages.
  describe('findMessages', () => {
    const conversationId = 'conversation-1';

    // Create sample messages so we can verify their ordering.
    const message1 = {
      id: 'message-1',
      conversationId,
      senderId: 'user-1',
      text: 'First message',
      createdAt: new Date('2026-10-13T10:00:00Z'),
    };

    const message2 = {
      id: 'message-2',
      conversationId,
      senderId: 'user-2',
      text: 'Second message',
      createdAt: new Date('2026-10-13T10:01:00Z'),
    };

    // Assume the conversation exists and return no messages by default.
    // Individual tests can override these mock responses when needed.
    beforeEach(() => {
      prisma.conversation.findFirst.mockResolvedValue({ id: conversationId });

      prisma.chatMessage.findMany.mockResolvedValue([]);
    });

    // Verify an empty conversation returns an empty page.
    it('should return an empty page when no messages exist', async () => {
      await expect(service.findMessages(conversationId, userId)).resolves.toEqual({
        items: [],
        nextCursor: null,
        hasMore: false,
      });

      // The service fetches one extra record to check for another page.
      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: { conversationId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      });
    });

    // Verify messages are returned oldest-first for chat display.
    it('should return messages in chronological order', async () => {
      // Simulate Prisma returning the messages newest-first.
      prisma.chatMessage.findMany.mockResolvedValue([
        message2,
        message1,
      ]);

      await expect(service.findMessages(conversationId, userId)).resolves.toEqual({
        items: [message1, message2],
        nextCursor: null,
        hasMore: false,
      });
    });

    // Verify a custom limit controls the number of returned messages.
    it('should respect a custom page size', async () => {
      await service.findMessages(conversationId, userId, 5);

      // Six records are fetched: five for the page and one extra for hasMore.
      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 6 }),
      );
    });

    // Prevent a zero or negative limit from producing an empty page size.
    it('should enforce a minimum page size of one', async () => {
      await service.findMessages(conversationId, userId, 0);

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 2 }),
      );
    });

    // Prevent a client from requesting an excessively large page.
    it('should enforce a maximum page size of 100', async () => {
      await service.findMessages(conversationId, userId, 500);

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 101 }),
      );
    });

    // Ignore the fractional part of a supplied page size.
    it('should round a fractional page size down', async () => {
      await service.findMessages(conversationId, userId, 2.8);

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 3 }),
      );
    });

    // Verify the service detects when another page of messages exists.
    it('should return a cursor when more messages are available', async () => {
      prisma.chatMessage.findMany.mockResolvedValue([
        { ...message2, id: 'message-3' },
        message2,
        message1,
      ]);

      await expect(service.findMessages(conversationId, userId, 2)).resolves.toEqual({
        items: [
          message2,
          { ...message2, id: 'message-3' },
        ],
        nextCursor: 'message-2',
        hasMore: true,
      });
    });

    // Reject requests for messages when the conversation does not exist.
    it('should throw NotFoundException when the conversation is missing', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.findMessages(conversationId, userId),
      ).rejects.toThrow(NotFoundException);

      // Do not query messages after discovering the conversation is missing.
      expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findMessages cursor validation', () => {
    const conversationId = 'conversation-1';
    const cursorId = 'message-cursor';
    const cursorDate = new Date('2026-01-01T12:00:00.000Z');

    beforeEach(() => {
      // Simulate an existing conversation and a message cursor in it.
      prisma.conversation.findFirst.mockResolvedValue({ id: conversationId });
      prisma.chatMessage.findUnique.mockResolvedValue({
        id: cursorId,
        conversationId,
        createdAt: cursorDate,
      });
      prisma.chatMessage.findMany.mockResolvedValue([]);
    });

    // Reject a cursor ID that does not identify an existing message.
    it('should throw NotFoundException when the cursor is missing', async () => {
      prisma.chatMessage.findUnique.mockResolvedValue(null);

      await expect(
        service.findMessages(conversationId, userId, 20, cursorId),
      ).rejects.toThrow(NotFoundException);

      // Do not fetch a page when the cursor cannot be validated.
      expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
    });

    // Prevent a cursor from another conversation being used here.
    it('should reject a cursor from a different conversation', async () => {
      prisma.chatMessage.findUnique.mockResolvedValue({
        id: cursorId,
        conversationId: 'another-conversation',
        createdAt: cursorDate,
      });

      await expect(
        service.findMessages(conversationId, userId, 20, cursorId),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
    });

    // Check timestamp and ID together for deterministic pagination.
    it('should filter by cursor timestamp and ID', async () => {
      await service.findMessages(conversationId, userId, 20, cursorId);

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: {
          conversationId,
          OR: [
            { createdAt: { lt: cursorDate } },
            {
              createdAt: cursorDate,
              id: { lt: cursorId },
            },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      });
    });
  });


  describe('createMessage', () => {
    const conversationId = 'conversation-1';
    const senderId = 'user-1';
    const messageText = 'Hello, world!';
    const createdMessage = {
      id: 'message-1',
      conversationId,
      senderId,
      text: messageText,
      createdAt: new Date('2026-01-01T12:00:00.000Z'),
    };

    beforeEach(() => {
      // Simulate an existing conversation and a successful database write.
      prisma.conversation.findFirst.mockResolvedValue({ id: conversationId });
      prisma.chatMessage.create.mockResolvedValue(createdMessage);
    });

    // Verify the service saves a message with the supplied details.
    it('should create a message in an existing conversation', async () => {
      await expect(
        service.createMessage(conversationId, senderId, messageText),
      ).resolves.toEqual(createdMessage);

      // Confirm the service checks the conversation before writing.
      expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
        where: { id: conversationId, participants: { some: { userId: senderId } } },
        select: { id: true },
      });

      // Confirm only the intended message fields are sent to Prisma.
      expect(prisma.chatMessage.create).toHaveBeenCalledWith({
        data: { conversationId, senderId, text: messageText },
      });
    });

    // Prevent messages from being saved to a nonexistent conversation.
    it('should throw NotFoundException when the conversation is missing', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.createMessage(conversationId, senderId, messageText),
      ).rejects.toThrow(NotFoundException);

      // Do not attempt to save a message when its conversation is missing.
      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    });
  });


  // Verify pagination ends when no extra message exists beyond the requested page.
  describe('pagination boundary', () => {
    it('should return no next cursor when exactly one page of messages exists', async () => {
      // Simulate Prisma returning exactly two messages for a page size of two.
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conversation-1' });
      prisma.chatMessage.findMany.mockResolvedValue([
        {
          id: 'message-2',
          conversationId: 'conversation-1',
          senderId: 'user-2',
          text: 'Second message',
          createdAt: new Date('2026-10-13T10:01:00Z'),
        },
        {
          id: 'message-1',
          conversationId: 'conversation-1',
          senderId: 'user-1',
          text: 'First message',
          createdAt: new Date('2026-10-13T10:00:00Z'),
        },
      ]);

      // Confirm messages are returned oldest-first without another-page cursor.
      const result = await service.findMessages('conversation-1', userId, 2);

      expect(result.items.map((message) => message.id)).toEqual([
        'message-1',
        'message-2',
      ]);
      expect(result.nextCursor).toBeNull();
      expect(result.hasMore).toBe(false);

      // Fetch one extra record so the service can detect additional pages.
      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 3 }),
      );
    });
  });

});
