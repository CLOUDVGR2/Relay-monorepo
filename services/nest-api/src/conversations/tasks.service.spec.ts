import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { TasksService } from './tasks.service.js';
import { TaskPriorityType } from './task.types.js';

describe('TasksService', () => {
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const messageId = '22222222-2222-4222-8222-222222222222';
  const actorId = '507f1f77bcf86cd799439011';
  const assigneeId = '507f191e810c19729de860ea';

  const prisma = {
    taskChecklistItem: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    conversation: {
      findFirst: vi.fn(),
    },
    conversationParticipant: {
      findFirst: vi.fn(),
    },
    chatMessage: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const tx = {
    taskChecklistItem: {
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    task: {
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    taskActivity: {
      create: vi.fn(),
    },
  };

  let service: TasksService;

  beforeEach(() => {
    vi.resetAllMocks();

    service = new TasksService(prisma as unknown as PrismaService);

    prisma.conversation.findFirst.mockResolvedValue({ id: conversationId });
    prisma.conversationParticipant.findFirst.mockResolvedValue({
      id: 'membership-1',
    });
    prisma.chatMessage.findFirst.mockResolvedValue({ id: messageId });

    prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );

    tx.task.create.mockResolvedValue({
      id: 'task-1',
      conversationId,
      title: 'Ship release',
    });
    tx.taskActivity.create.mockResolvedValue({ id: 'activity-1' });
    tx.task.findUniqueOrThrow.mockResolvedValue({
      id: 'task-1',
      conversationId,
      title: 'Ship release',
      checklistItems: [],
      activities: [{ id: 'activity-1', action: 'TASK_CREATED' }],
      links: [],
    });
    prisma.task.findUniqueOrThrow.mockResolvedValue({
      id: 'task-1',
      conversationId,
      title: 'Ship release',
      checklistItems: [],
      activities: [{ id: 'activity-1', action: 'TASK_CREATED' }],
      links: [],
    });
  });

  it('creates a task and records its activity in one transaction', async () => {
    const input = {
      conversationId,
      title: '  Ship release  ',
      description: '  Finish release checks  ',
      priority: TaskPriorityType.HIGH,
      assigneeId: assigneeId.toUpperCase(),
      sourceMessageId: messageId,
      dueDate: new Date('2026-11-01T12:00:00.000Z'),
    };

    const result = await service.create(input, actorId.toUpperCase());

    expect(result.id).toBe('task-1');
    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: {
        id: conversationId,
        participants: { some: { userId: actorId } },
      },
      select: { id: true },
    });
    expect(prisma.conversationParticipant.findFirst).toHaveBeenCalledWith({
      where: { conversationId, userId: assigneeId },
      select: { id: true },
    });
    expect(prisma.chatMessage.findFirst).toHaveBeenCalledWith({
      where: { id: messageId, conversationId },
      select: { id: true },
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.task.create).toHaveBeenCalledWith({
      data: {
        conversationId,
        sourceMessageId: messageId,
        title: 'Ship release',
        description: 'Finish release checks',
        creatorId: actorId,
        assigneeId,
        dueDate: input.dueDate,
        priority: TaskPriorityType.HIGH,
      },
    });
    expect(tx.taskActivity.create).toHaveBeenCalledWith({
      data: {
        taskId: 'task-1',
        actorId,
        action: 'TASK_CREATED',
        description: 'Task created',
      },
    });
    expect(tx.task.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      include: {
        checklistItems: { orderBy: { position: 'asc' } },
        activities: { orderBy: { createdAt: 'asc' } },
        links: { orderBy: { createdAt: 'asc' } },
      },
    });
  });

  it('rejects a blank task title', async () => {
    await expect(
      service.create({ conversationId, title: '   ' }, actorId),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.conversation.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a title longer than 200 characters', async () => {
    await expect(
      service.create({ conversationId, title: 'x'.repeat(201) }, actorId),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an invalid due date', async () => {
    await expect(
      service.create(
        {
          conversationId,
          title: 'Ship release',
          dueDate: new Date('invalid'),
        },
        actorId,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not disclose a conversation the actor cannot access', async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);

    await expect(
      service.create({ conversationId, title: 'Ship release' }, actorId),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.conversationParticipant.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an assignee who is not a conversation participant', async () => {
    prisma.conversationParticipant.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        { conversationId, title: 'Ship release', assigneeId },
        actorId,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a source message from another conversation', async () => {
    prisma.chatMessage.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        { conversationId, title: 'Ship release', sourceMessageId: messageId },
        actorId,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('defaults priority and optional fields when omitted', async () => {
    await service.create({ conversationId, title: 'Ship release' }, actorId);

    expect(tx.task.create).toHaveBeenCalledWith({
      data: {
        conversationId,
        sourceMessageId: null,
        title: 'Ship release',
        description: null,
        creatorId: actorId,
        assigneeId: null,
        dueDate: null,
        priority: TaskPriorityType.MEDIUM,
      },
    });
  });

  it('lists tasks with bounded pagination and the requested status', async () => {
    const tasks = [{ id: 'task-1', title: 'Ship release' }];
    prisma.task.findMany.mockResolvedValue(tasks);

    const result = await service.list(
      { conversationId, limit: 25, offset: 10, status: 'IN_PROGRESS' as never },
      actorId,
    );

    expect(result).toEqual(tasks);
    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: {
        id: conversationId,
        participants: { some: { userId: actorId } },
      },
      select: { id: true },
    });
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: { conversationId, status: 'IN_PROGRESS' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 25,
      include: {
        checklistItems: { orderBy: { position: 'asc' } },
        activities: { orderBy: { createdAt: 'asc' } },
        links: { orderBy: { createdAt: 'asc' } },
      },
    });
  });

  it('does not list tasks for a non-member', async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);

    await expect(
      service.list({ conversationId, limit: 20, offset: 0 }, actorId),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });

  it('updates a task and records the changed fields in one transaction', async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: 'task-1',
      conversationId,
      title: 'Ship release',
      description: null,
      assigneeId: null,
      dueDate: null,
      priority: TaskPriorityType.MEDIUM,
      status: 'TODO',
    });
    tx.task.update.mockResolvedValue({ id: 'task-1', status: 'DONE' });

    const result = await service.update(
      {
        taskId: '33333333-3333-4333-8333-333333333333',
        status: 'DONE' as never,
      },
      actorId,
    );

    expect(result).toEqual({
      id: 'task-1',
      conversationId,
      title: 'Ship release',
      checklistItems: [],
      activities: [{ id: 'activity-1', action: 'TASK_CREATED' }],
      links: [],
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { status: 'DONE' },
    });
    expect(tx.taskActivity.create).toHaveBeenCalledWith({
      data: {
        taskId: 'task-1',
        actorId,
        action: 'TASK_UPDATED',
        description: 'Updated status',
      },
    });
  });

  it('clears description, assignee, and due date and records the update', async () => {
    const dueDate = new Date('2026-11-01T12:00:00.000Z');

    prisma.task.findFirst.mockResolvedValue({
      id: 'task-1',
      conversationId,
      title: 'Ship release',
      description: 'Old description',
      assigneeId,
      dueDate,
      priority: TaskPriorityType.MEDIUM,
      status: 'TODO',
    });

    const result = await service.update(
      {
        taskId: '33333333-3333-4333-8333-333333333333',
        description: null,
        assigneeId: null,
        dueDate: null,
      },
      actorId,
    );

    expect(result.id).toBe('task-1');
    expect(tx.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: {
        description: null,
        assigneeId: null,
        dueDate: null,
      },
    });
    expect(tx.taskActivity.create).toHaveBeenCalledWith({
      data: {
        taskId: 'task-1',
        actorId,
        action: 'TASK_UPDATED',
        description: 'Updated description, assignee, due date',
      },
    });
  });

  it('does not write an activity when the update makes no changes', async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: 'task-1',
      conversationId,
      title: 'Ship release',
      description: 'Existing description',
      assigneeId: null,
      dueDate: null,
      priority: TaskPriorityType.MEDIUM,
      status: 'TODO',
    });

    const result = await service.update(
      {
        taskId: '33333333-3333-4333-8333-333333333333',
        title: '  Ship release  ',
        description: 'Existing description',
      },
      actorId,
    );

    expect(result.id).toBe('task-1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.task.update).not.toHaveBeenCalled();
    expect(tx.taskActivity.create).not.toHaveBeenCalled();
    expect(prisma.task.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      include: {
        checklistItems: { orderBy: { position: 'asc' } },
        activities: { orderBy: { createdAt: 'asc' } },
        links: { orderBy: { createdAt: 'asc' } },
      },
    });
  });

  it('rejects a blank title in the service', async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: 'task-1',
      conversationId,
      title: 'Ship release',
      description: null,
      assigneeId: null,
      dueDate: null,
      priority: TaskPriorityType.MEDIUM,
      status: 'TODO',
    });

    await expect(
      service.update(
        {
          taskId: '33333333-3333-4333-8333-333333333333',
          title: '   ',
        },
        actorId,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects updates to a task the actor cannot access', async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    await expect(
      service.update(
        { taskId: '33333333-3333-4333-8333-333333333333', title: 'New title' },
        actorId,
      ),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('TasksService checklist items', () => {
  const taskId = '33333333-3333-4333-8333-333333333333';
  const itemId = '44444444-4444-4444-8444-444444444444';
  const actorId = '507f1f77bcf86cd799439011';

  const prisma = {
    taskChecklistItem: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    conversation: {
      findFirst: vi.fn(),
    },
    conversationParticipant: {
      findFirst: vi.fn(),
    },
    chatMessage: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const tx = {
    taskChecklistItem: {
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    task: {
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    taskActivity: {
      create: vi.fn(),
    },
  };

  let service: TasksService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new TasksService(prisma as unknown as PrismaService);

    prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );
  });

  it('adds a checklist item and records activity transactionally', async () => {
    const item = {
      id: itemId,
      taskId,
      text: '  Run tests  ',
      completed: false,
      position: 2,
    };

    prisma.task.findFirst.mockResolvedValue({ id: taskId });
    tx.taskChecklistItem.create.mockResolvedValue(item);

    await expect(
      service.addChecklistItem(
        { taskId, text: '  Run tests  ', position: 2 },
        actorId,
      ),
    ).resolves.toEqual(item);

    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: {
        id: taskId,
        conversation: {
          participants: { some: { userId: actorId } },
        },
      },
      select: { id: true },
    });

    expect(tx.taskChecklistItem.create).toHaveBeenCalledWith({
      data: { taskId, text: 'Run tests', position: 2 },
    });

    expect(tx.taskActivity.create).toHaveBeenCalledWith({
      data: {
        taskId,
        actorId,
        action: 'CHECKLIST_ITEM_ADDED',
        description: 'Added a checklist item',
      },
    });
  });

  it('rejects adding a checklist item to an inaccessible task', async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    await expect(
      service.addChecklistItem({ taskId, text: 'Run tests' }, actorId),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('updates checklist text and completion and records activity', async () => {
    prisma.taskChecklistItem.findFirst.mockResolvedValue({
      id: itemId,
      taskId,
      text: 'Run tests',
      completed: false,
    });

    const updated = {
      id: itemId,
      taskId,
      text: 'Run all tests',
      completed: true,
    };

    tx.taskChecklistItem.update.mockResolvedValue(updated);

    await expect(
      service.updateChecklistItem(
        { itemId, text: ' Run all tests ', completed: true },
        actorId,
      ),
    ).resolves.toEqual(updated);

    expect(tx.taskChecklistItem.update).toHaveBeenCalledWith({
      where: { id: itemId },
      data: { text: 'Run all tests', completed: true },
    });

    expect(tx.taskActivity.create).toHaveBeenCalledWith({
      data: {
        taskId,
        actorId,
        action: 'CHECKLIST_ITEM_UPDATED',
        description: 'Updated checklist item text and completion',
      },
    });
  });

  it('rejects updating a checklist item the actor cannot access', async () => {
    prisma.taskChecklistItem.findFirst.mockResolvedValue(null);

    await expect(
      service.updateChecklistItem({ itemId, completed: true }, actorId),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deletes a checklist item and records activity transactionally', async () => {
    prisma.taskChecklistItem.findFirst.mockResolvedValue({
      id: itemId,
      taskId,
    });

    const deleted = { id: itemId, taskId };
    tx.taskChecklistItem.delete.mockResolvedValue(deleted);

    await expect(
      service.deleteChecklistItem({ itemId }, actorId),
    ).resolves.toEqual(deleted);

    expect(tx.taskChecklistItem.delete).toHaveBeenCalledWith({
      where: { id: itemId },
    });

    expect(tx.taskActivity.create).toHaveBeenCalledWith({
      data: {
        taskId,
        actorId,
        action: 'CHECKLIST_ITEM_DELETED',
        description: 'Deleted a checklist item',
      },
    });
  });
});

describe('TasksService task links', () => {
  const taskId = '33333333-3333-4333-8333-333333333333';
  const linkId = '55555555-5555-4555-8555-555555555555';
  const actorId = '507f1f77bcf86cd799439011';

  const prisma = {
    task: {
      findFirst: vi.fn(),
    },
    taskLink: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const tx = {
    taskLink: {
      create: vi.fn(),
      delete: vi.fn(),
    },
    taskActivity: {
      create: vi.fn(),
    },
  };

  let service: TasksService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new TasksService(prisma as unknown as PrismaService);

    prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );
  });

  it('adds a valid HTTPS link and records activity transactionally', async () => {
    const input = {
      taskId,
      url: 'https://example.com/docs',
      title: 'Documentation',
    };
    const link = {
      id: linkId,
      taskId,
      url: input.url,
      title: input.title,
      creatorId: actorId,
    };

    prisma.task.findFirst.mockResolvedValue({ id: taskId });
    tx.taskLink.create.mockResolvedValue(link);

    await expect(service.addTaskLink(input, actorId)).resolves.toEqual(link);

    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: {
        id: taskId,
        conversation: { participants: { some: { userId: actorId } } },
      },
      select: { id: true },
    });
    expect(tx.taskLink.create).toHaveBeenCalledWith({
      data: {
        taskId,
        url: input.url,
        title: input.title,
        creatorId: actorId,
      },
    });
    expect(tx.taskActivity.create).toHaveBeenCalledWith({
      data: {
        taskId,
        actorId,
        action: 'TASK_LINK_ADDED',
        description: 'Added a link to the task',
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('rejects non-HTTP URL schemes', async () => {
    await expect(
      service.addTaskLink({ taskId, url: 'javascript:alert(1)' }, actorId),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.task.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects adding a link to an inaccessible task', async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    await expect(
      service.addTaskLink({ taskId, url: 'https://example.com/docs' }, actorId),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deletes a link and records activity transactionally', async () => {
    const link = { id: linkId, taskId };
    const deleted = {
      id: linkId,
      taskId,
      url: 'https://example.com/docs',
    };

    prisma.taskLink.findFirst.mockResolvedValue(link);
    tx.taskLink.delete.mockResolvedValue(deleted);

    await expect(service.deleteTaskLink({ linkId }, actorId)).resolves.toEqual(
      deleted,
    );

    expect(prisma.taskLink.findFirst).toHaveBeenCalledWith({
      where: {
        id: linkId,
        task: {
          conversation: { participants: { some: { userId: actorId } } },
        },
      },
      select: { id: true, taskId: true },
    });
    expect(tx.taskLink.delete).toHaveBeenCalledWith({
      where: { id: linkId },
    });
    expect(tx.taskActivity.create).toHaveBeenCalledWith({
      data: {
        taskId,
        actorId,
        action: 'TASK_LINK_DELETED',
        description: 'Removed a link from the task',
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('rejects deleting a link the actor cannot access', async () => {
    prisma.taskLink.findFirst.mockResolvedValue(null);

    await expect(service.deleteTaskLink({ linkId }, actorId)).rejects.toThrow(
      NotFoundException,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
