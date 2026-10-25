import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TasksResolver } from './tasks.resolver.js';
import { TasksService } from './tasks.service.js';
import { TaskPriorityType } from './task.types.js';

describe('TasksResolver', () => {
  const tasksService = {
    create: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    addChecklistItem: vi.fn(),
    updateChecklistItem: vi.fn(),
    deleteChecklistItem: vi.fn(),
  };

  const request = {
    user: { id: '507f1f77bcf86cd799439011' },
  };

  let resolver: TasksResolver;

  beforeEach(() => {
    vi.resetAllMocks();
    resolver = new TasksResolver(tasksService as unknown as TasksService);
  });

  it('creates a task using the authenticated user as creator', async () => {
    const input = {
      conversationId: '11111111-1111-4111-8111-111111111111',
      title: 'Ship release',
      priority: TaskPriorityType.HIGH,
    };

    const task = {
      id: 'task-1',
      ...input,
      creatorId: request.user.id,
    };

    tasksService.create.mockResolvedValue(task);

    await expect(resolver.createTask(input, request as never)).resolves.toEqual(
      task,
    );

    expect(tasksService.create).toHaveBeenCalledOnce();
    expect(tasksService.create).toHaveBeenCalledWith(input, request.user.id);
  });

  it('propagates service errors', async () => {
    tasksService.create.mockRejectedValue(new Error('Task creation failed'));

    await expect(
      resolver.createTask(
        {
          conversationId: '11111111-1111-4111-8111-111111111111',
          title: 'Ship release',
        },
        request as never,
      ),
    ).rejects.toThrow('Task creation failed');
  });

  it('lists tasks using the authenticated user', async () => {
    const input = {
      conversationId: '11111111-1111-4111-8111-111111111111',
      limit: 25,
      offset: 0,
    };
    const tasks = [{ id: 'task-1', title: 'Ship release' }];
    tasksService.list.mockResolvedValue(tasks);

    await expect(resolver.listTasks(input, request as never)).resolves.toEqual(
      tasks,
    );

    expect(tasksService.list).toHaveBeenCalledWith(input, request.user.id);
  });

  it('updates tasks using the authenticated user', async () => {
    const input = {
      taskId: '22222222-2222-4222-8222-222222222222',
      status: 'DONE',
    };
    const task = { id: input.taskId, status: 'DONE' };
    tasksService.update.mockResolvedValue(task);

    await expect(
      resolver.updateTask(input as never, request as never),
    ).resolves.toEqual(task);

    expect(tasksService.update).toHaveBeenCalledWith(input, request.user.id);
  });
});

describe('TasksResolver checklist items', () => {
  const tasksService = {
    addChecklistItem: vi.fn(),
    updateChecklistItem: vi.fn(),
    deleteChecklistItem: vi.fn(),
  };

  const request = {
    user: { id: '507f1f77bcf86cd799439011' },
  };

  let resolver: TasksResolver;

  beforeEach(() => {
    vi.resetAllMocks();
    resolver = new TasksResolver({
      addChecklistItem: tasksService.addChecklistItem,
      updateChecklistItem: tasksService.updateChecklistItem,
      deleteChecklistItem: tasksService.deleteChecklistItem,
    } as unknown as TasksService);
  });

  it('adds a checklist item using the authenticated user', async () => {
    const input = {
      taskId: '22222222-2222-4222-8222-222222222222',
      text: 'Review pull request',
    };
    const item = { id: 'item-1', ...input };
    tasksService.addChecklistItem.mockResolvedValue(item);

    await expect(
      resolver.addTaskChecklistItem(input, request as never),
    ).resolves.toEqual(item);

    expect(tasksService.addChecklistItem).toHaveBeenCalledWith(
      input,
      request.user.id,
    );
  });

  it('updates a checklist item using the authenticated user', async () => {
    const input = {
      itemId: '33333333-3333-4333-8333-333333333333',
      completed: true,
    };
    const item = { id: input.itemId, completed: true };
    tasksService.updateChecklistItem.mockResolvedValue(item);

    await expect(
      resolver.updateTaskChecklistItem(input, request as never),
    ).resolves.toEqual(item);

    expect(tasksService.updateChecklistItem).toHaveBeenCalledWith(
      input,
      request.user.id,
    );
  });

  it('deletes a checklist item using the authenticated user', async () => {
    const input = {
      itemId: '44444444-4444-4444-8444-444444444444',
    };
    const item = { id: input.itemId };
    tasksService.deleteChecklistItem.mockResolvedValue(item);

    await expect(
      resolver.deleteTaskChecklistItem(input, request as never),
    ).resolves.toEqual(item);

    expect(tasksService.deleteChecklistItem).toHaveBeenCalledWith(
      input,
      request.user.id,
    );
  });
});

describe('TasksResolver task links', () => {
  const tasksService = {
    addTaskLink: vi.fn(),
    deleteTaskLink: vi.fn(),
  };

  const request = {
    user: { id: '507f1f77bcf86cd799439011' },
  };

  let resolver: TasksResolver;

  beforeEach(() => {
    vi.resetAllMocks();
    resolver = new TasksResolver(tasksService as unknown as TasksService);
  });

  it('adds a task link using the authenticated user', async () => {
    const input = {
      taskId: '22222222-2222-4222-8222-222222222222',
      url: 'https://example.com/docs',
      title: 'Documentation',
    };
    const link = { id: 'link-1', ...input };
    tasksService.addTaskLink.mockResolvedValue(link);

    await expect(
      resolver.addTaskLink(input, request as never),
    ).resolves.toEqual(link);

    expect(tasksService.addTaskLink).toHaveBeenCalledWith(
      input,
      request.user.id,
    );
  });

  it('deletes a task link using the authenticated user', async () => {
    const input = {
      linkId: '33333333-3333-4333-8333-333333333333',
    };
    const link = {
      id: input.linkId,
      url: 'https://example.com/docs',
    };
    tasksService.deleteTaskLink.mockResolvedValue(link);

    await expect(
      resolver.deleteTaskLink(input, request as never),
    ).resolves.toEqual(link);

    expect(tasksService.deleteTaskLink).toHaveBeenCalledWith(
      input,
      request.user.id,
    );
  });
});
