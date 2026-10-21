/** Tests for conversations resolver spec in the nest api. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationsResolver } from './conversations.resolver.js';
import { ConversationsService } from './conversations.service.js';

describe('ConversationsResolver', () => {
  // Mock the service so these tests focus on resolver behavior.
  const service = {
    findAll: vi.fn(),
    findAllMessages: vi.fn(),
    findMessages: vi.fn(),
    create: vi.fn(),
    createMessage: vi.fn(),
    addParticipants: vi.fn(),
    updateDetails: vi.fn(),
  };

  const request = { user: { id: 'user-1' } };
  let resolver: ConversationsResolver;

  beforeEach(() => {
    // Clear previous calls and results before every test.
    vi.resetAllMocks();

    resolver = new ConversationsResolver(
      service as unknown as ConversationsService,
    );
  });

  // Verify the resolver returns the conversation list from the service.
  it('should return conversations from the service', async () => {
    const conversations = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        createdAt: new Date('2026-10-13T10:00:00Z'),
        updatedAt: new Date('2026-10-13T10:00:00Z'),
        messages: [],
      },
    ];
    service.findAll.mockResolvedValue(conversations);

    await expect(resolver.findAll(request as never)).resolves.toEqual(conversations);
    expect(service.findAll).toHaveBeenCalledWith('user-1');
  });

  it('should lazily load messages for the authenticated conversation participant', async () => {
    const conversation = {
      id: '11111111-1111-4111-8111-111111111111',
    };
    const messages = [{ id: 'message-1', text: 'Hello' }];
    service.findAllMessages.mockResolvedValue(messages);

    await expect(
      resolver.messages(conversation as never, request as never),
    ).resolves.toEqual(messages);

    expect(service.findAllMessages).toHaveBeenCalledWith(
      conversation.id,
      'user-1',
    );
  });

  // Verify pagination input is forwarded to the service in the right order.
  it('should retrieve a page of conversation messages', async () => {
    const input = {
      conversationId: '11111111-1111-4111-8111-111111111111',
      limit: 10,
      before: '22222222-2222-4222-8222-222222222222',
    };
    const result = { items: [], nextCursor: null, hasMore: false };
    service.findMessages.mockResolvedValue(result);

    await expect(resolver.conversationMessages(input, request as never)).resolves.toEqual(result);
    expect(service.findMessages).toHaveBeenCalledWith(
      input.conversationId,
      'user-1',
      input.limit,
      input.before,
    );
  });

  // Verify conversation creation delegates to the service.
  it('should create a conversation', async () => {
    const conversation = {
      id: '11111111-1111-4111-8111-111111111111',
      createdAt: new Date('2026-10-13T10:00:00Z'),
      updatedAt: new Date('2026-10-13T10:00:00Z'),
      messages: [],
    };
    service.create.mockResolvedValue(conversation);

    await expect(resolver.createConversation({ participantIds: ['user-2'] } as never, request as never)).resolves.toEqual(conversation);
    expect(service.create).toHaveBeenCalledWith(
      'user-1',
      ['user-2'],
      undefined,
      undefined,
    );
  });

  // Verify adding participants delegates to the service with the authenticated actor.
  it('should add conversation participants', async () => {
    const input = {
      conversationId: '11111111-1111-4111-8111-111111111111',
      participantIds: ['user-2', 'user-3'],
    };
    const conversation = {
      id: input.conversationId,
      participants: [
        { userId: 'user-1', role: 'ADMIN' },
        { userId: 'user-2', role: 'MEMBER' },
        { userId: 'user-3', role: 'MEMBER' },
      ],
      messages: [],
    };

    service.addParticipants.mockResolvedValue(conversation);

    await expect(
      resolver.addConversationParticipants(input as never, request as never),
    ).resolves.toEqual(conversation);

    expect(service.addParticipants).toHaveBeenCalledWith(
      input.conversationId,
      'user-1',
      input.participantIds,
    );
  });


  // Verify conversation metadata updates use the authenticated actor.
  it('should update conversation details', async () => {
    const input = {
      conversationId: '11111111-1111-4111-8111-111111111111',
      name: 'Project Team',
      description: 'A group for project discussions',
    };
    const conversation = {
      id: input.conversationId,
      name: input.name,
      description: input.description,
      participants: [{ userId: 'user-1', role: 'ADMIN' }],
      messages: [],
    };

    service.updateDetails.mockResolvedValue(conversation);

    await expect(
      resolver.updateConversationDetails(input as never, request as never),
    ).resolves.toEqual(conversation);

    expect(service.updateDetails).toHaveBeenCalledWith(
      input.conversationId,
      'user-1',
      input.name,
      input.description,
    );
  });


  // Verify message input fields are passed to the service.
  it('should create a message', async () => {
    const input = {
      conversationId: '11111111-1111-4111-8111-111111111111',
      text: 'Hello, world!',
    };
    const message = {
      id: '33333333-3333-4333-8333-333333333333',
      ...input,
      createdAt: new Date('2026-10-13T10:00:00Z'),
    };
    service.createMessage.mockResolvedValue(message);

    await expect(resolver.createMessage(input as never, request as never)).resolves.toEqual(message);
    expect(service.createMessage).toHaveBeenCalledWith(
      input.conversationId,
      'user-1',
      input.text,
    );
  });
});
