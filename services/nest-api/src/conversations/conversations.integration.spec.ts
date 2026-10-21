/** Tests for conversations integration spec in the nest api. */

import 'dotenv/config';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConversationsService } from './conversations.service.js';
import { AuthUserService } from '../auth/auth-user.service.js';

describe('ConversationsService database integration', () => {
  const prisma = new PrismaService();
  const creatorId = 'integration-test-user';
  const otherId = 'integration-test-other-user';

  // Account lookup is mocked; conversation and message persistence use real PostgreSQL.
  const authUsers = { findExistingUserIds: async (ids: string[]) => ids };
  const service = new ConversationsService(
    prisma,
    authUsers as unknown as AuthUserService,
  );

  let conversationId: string | undefined;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    try {
      if (conversationId) {
        await prisma.conversation.deleteMany({
          where: { id: conversationId },
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it('persists a conversation and paginates messages across PostgreSQL pages', async () => {
    const conversation = await service.create(creatorId, [otherId]);
    conversationId = conversation.id;

    expect(conversation.id).toBeTruthy();
    expect(conversation.participants).toHaveLength(2);
    expect(conversation).not.toHaveProperty('messages');

    const expectedTexts = [
      'Integration pagination message A',
      'Integration pagination message B',
      'Integration pagination message C',
    ];

    const createdMessages = [];
    for (const text of expectedTexts) {
      createdMessages.push(
        await service.createMessage(conversationId, creatorId, text),
      );
    }

    // The first page should contain two messages and indicate older data remains.
    const firstPage = await service.findMessages(
      conversationId,
      creatorId,
      2,
    );

    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toBeTruthy();

    // Fetch the remaining older message using the cursor returned by PostgreSQL.
    const secondPage = await service.findMessages(
      conversationId,
      creatorId,
      2,
      firstPage.nextCursor!,
    );

    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toBeNull();

    const allPageItems = [...firstPage.items, ...secondPage.items];
    const returnedIds = allPageItems.map((message) => message.id);
    const returnedTexts = allPageItems.map((message) => message.text);

    // Each persisted message appears exactly once across both pages.
    expect(new Set(returnedIds).size).toBe(3);
    expect(returnedIds.sort()).toEqual(
      createdMessages.map((message) => message.id).sort(),
    );
    expect(returnedTexts.sort()).toEqual([...expectedTexts].sort());

    // Verify the records can also be read back from PostgreSQL directly.
    const storedMessages = await prisma.chatMessage.findMany({
      where: { conversationId },
    });
    expect(storedMessages).toHaveLength(3);
  });
});
