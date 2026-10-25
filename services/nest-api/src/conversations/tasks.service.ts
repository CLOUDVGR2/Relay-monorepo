/** Authorization and persistence for conversation tasks. */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  TaskPriorityType,
  type AddTaskChecklistItemInput,
  type DeleteTaskChecklistItemInput,
  type UpdateTaskChecklistItemInput,
  type AddTaskLinkInput,
  type DeleteTaskLinkInput,
  type CreateTaskInput,
  type ListTasksInput,
  type UpdateTaskInput,
} from './task.types.js';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateTaskInput, actorId: string) {
    const conversationId = input.conversationId;
    const actor = actorId.toLowerCase();
    const title = input.title.trim();

    if (!title || title.length > 200) {
      throw new BadRequestException(
        'Task title must contain between 1 and 200 characters',
      );
    }

    if (input.description != null && input.description.length > 10000) {
      throw new BadRequestException('Task description is too long');
    }

    if (
      input.dueDate != null &&
      (!(input.dueDate instanceof Date) ||
        Number.isNaN(input.dueDate.getTime()))
    ) {
      throw new BadRequestException('Task due date must be a valid date');
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: { some: { userId: actor } },
      },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const assigneeId = input.assigneeId?.toLowerCase() ?? null;

    if (assigneeId) {
      const membership = await this.prisma.conversationParticipant.findFirst({
        where: { conversationId, userId: assigneeId },
        select: { id: true },
      });

      if (!membership) {
        throw new BadRequestException(
          'Task assignee must be a participant in this conversation',
        );
      }
    }

    const sourceMessageId = input.sourceMessageId ?? null;

    if (sourceMessageId) {
      const sourceMessage = await this.prisma.chatMessage.findFirst({
        where: { id: sourceMessageId, conversationId },
        select: { id: true },
      });

      if (!sourceMessage) {
        throw new BadRequestException(
          'Source message must belong to this conversation',
        );
      }
    }

    const priority = input.priority ?? TaskPriorityType.MEDIUM;

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          conversationId,
          sourceMessageId,
          title,
          description: input.description?.trim() || null,
          creatorId: actor,
          assigneeId,
          dueDate: input.dueDate ?? null,
          priority,
        },
      });

      await tx.taskActivity.create({
        data: {
          taskId: task.id,
          actorId: actor,
          action: 'TASK_CREATED',
          description: 'Task created',
        },
      });

      return tx.task.findUniqueOrThrow({
        where: { id: task.id },
        include: {
          checklistItems: { orderBy: { position: 'asc' } },
          activities: { orderBy: { createdAt: 'asc' } },
          links: { orderBy: { createdAt: 'asc' } },
        },
      });
    });
  }

  async list(input: ListTasksInput, actorId: string) {
    const actor = actorId.toLowerCase();

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: input.conversationId,
        participants: { some: { userId: actor } },
      },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const offset = Math.max(input.offset ?? 0, 0);

    return this.prisma.task.findMany({
      where: {
        conversationId: input.conversationId,
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      skip: offset,
      include: {
        checklistItems: { orderBy: { position: 'asc' } },
        activities: { orderBy: { createdAt: 'asc' } },
        links: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async update(input: UpdateTaskInput, actorId: string) {
    const actor = actorId.toLowerCase();

    const existing = await this.prisma.task.findFirst({
      where: {
        id: input.taskId,
        conversation: {
          participants: { some: { userId: actor } },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const data: {
      title?: string;
      description?: string | null;
      assigneeId?: string | null;
      dueDate?: Date | null;
      priority?: TaskPriorityType;
      status?: UpdateTaskInput['status'];
    } = {};

    const changes: string[] = [];

    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title || title.length > 200) {
        throw new BadRequestException(
          'Task title must contain between 1 and 200 characters',
        );
      }
      if (title !== existing.title) {
        data.title = title;
        changes.push('title');
      }
    }

    if (input.description !== undefined) {
      const description = input.description?.trim() || null;
      if (description !== null && description.length > 10000) {
        throw new BadRequestException('Task description is too long');
      }
      if (description !== existing.description) {
        data.description = description;
        changes.push('description');
      }
    }

    if (input.assigneeId !== undefined) {
      const assigneeId = input.assigneeId?.toLowerCase() ?? null;

      if (assigneeId) {
        const membership = await this.prisma.conversationParticipant.findFirst({
          where: {
            conversationId: existing.conversationId,
            userId: assigneeId,
          },
          select: { id: true },
        });

        if (!membership) {
          throw new BadRequestException(
            'Task assignee must be a participant in this conversation',
          );
        }
      }

      if (assigneeId !== existing.assigneeId) {
        data.assigneeId = assigneeId;
        changes.push('assignee');
      }
    }

    if (input.dueDate !== undefined) {
      if (
        input.dueDate !== null &&
        (!(input.dueDate instanceof Date) ||
          Number.isNaN(input.dueDate.getTime()))
      ) {
        throw new BadRequestException('Task due date must be a valid date');
      }
      const oldDue = existing.dueDate?.getTime() ?? null;
      const newDue = input.dueDate?.getTime() ?? null;
      if (oldDue !== newDue) {
        data.dueDate = input.dueDate;
        changes.push('due date');
      }
    }

    if (input.priority !== undefined && input.priority !== existing.priority) {
      data.priority = input.priority;
      changes.push('priority');
    }

    if (input.status !== undefined && input.status !== existing.status) {
      data.status = input.status;
      changes.push('status');
    }

    if (changes.length === 0) {
      return this.prisma.task.findUniqueOrThrow({
        where: { id: existing.id },
        include: {
          checklistItems: { orderBy: { position: 'asc' } },
          activities: { orderBy: { createdAt: 'asc' } },
          links: { orderBy: { createdAt: 'asc' } },
        },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: existing.id },
        data,
      });

      await tx.taskActivity.create({
        data: {
          taskId: existing.id,
          actorId: actor,
          action: 'TASK_UPDATED',
          description: `Updated ${changes.join(', ')}`,
        },
      });

      return tx.task.findUniqueOrThrow({
        where: { id: existing.id },
        include: {
          checklistItems: { orderBy: { position: 'asc' } },
          activities: { orderBy: { createdAt: 'asc' } },
          links: { orderBy: { createdAt: 'asc' } },
        },
      });
    });
  }

  async addChecklistItem(input: AddTaskChecklistItemInput, actorId: string) {
    const actor = actorId.toLowerCase();
    const text = input.text.trim();

    if (!text || text.length > 500) {
      throw new BadRequestException(
        'Checklist item text must contain between 1 and 500 characters',
      );
    }

    const task = await this.prisma.task.findFirst({
      where: {
        id: input.taskId,
        conversation: { participants: { some: { userId: actor } } },
      },
      select: { id: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.taskChecklistItem.create({
        data: {
          taskId: task.id,
          text,
          ...(input.position !== undefined ? { position: input.position } : {}),
        },
      });

      await tx.taskActivity.create({
        data: {
          taskId: task.id,
          actorId: actor,
          action: 'CHECKLIST_ITEM_ADDED',
          description: 'Added a checklist item',
        },
      });

      return item;
    });
  }

  async updateChecklistItem(
    input: UpdateTaskChecklistItemInput,
    actorId: string,
  ) {
    const actor = actorId.toLowerCase();

    if (input.text === undefined && input.completed === undefined) {
      throw new BadRequestException('Provide text or completed to update');
    }

    const item = await this.prisma.taskChecklistItem.findFirst({
      where: {
        id: input.itemId,
        task: {
          conversation: { participants: { some: { userId: actor } } },
        },
      },
      select: { id: true, taskId: true, text: true, completed: true },
    });

    if (!item) {
      throw new NotFoundException('Checklist item not found');
    }

    const data: { text?: string; completed?: boolean } = {};
    const changes: string[] = [];

    if (input.text !== undefined) {
      const text = input.text.trim();
      if (!text || text.length > 500) {
        throw new BadRequestException(
          'Checklist item text must contain between 1 and 500 characters',
        );
      }
      if (text !== item.text) {
        data.text = text;
        changes.push('text');
      }
    }

    if (input.completed !== undefined && input.completed !== item.completed) {
      data.completed = input.completed;
      changes.push('completion');
    }

    if (changes.length === 0) {
      return this.prisma.taskChecklistItem.findUniqueOrThrow({
        where: { id: item.id },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.taskChecklistItem.update({
        where: { id: item.id },
        data,
      });

      await tx.taskActivity.create({
        data: {
          taskId: item.taskId,
          actorId: actor,
          action: 'CHECKLIST_ITEM_UPDATED',
          description: `Updated checklist item ${changes.join(' and ')}`,
        },
      });

      return updated;
    });
  }

  async deleteChecklistItem(
    input: DeleteTaskChecklistItemInput,
    actorId: string,
  ) {
    const actor = actorId.toLowerCase();

    const item = await this.prisma.taskChecklistItem.findFirst({
      where: {
        id: input.itemId,
        task: {
          conversation: { participants: { some: { userId: actor } } },
        },
      },
      select: { id: true, taskId: true },
    });

    if (!item) {
      throw new NotFoundException('Checklist item not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.taskChecklistItem.delete({
        where: { id: item.id },
      });

      await tx.taskActivity.create({
        data: {
          taskId: item.taskId,
          actorId: actor,
          action: 'CHECKLIST_ITEM_DELETED',
          description: 'Deleted a checklist item',
        },
      });

      return deleted;
    });
  }

  async addTaskLink(input: AddTaskLinkInput, actorId: string) {
    const actor = actorId.toLowerCase();
    const url = input.url.trim();
    let parsedUrl: URL;

    if (!url || url.length > 2048) {
      throw new BadRequestException(
        'Task link URL must contain 1 to 2048 characters',
      );
    }

    try {
      parsedUrl = new URL(url);
    } catch {
      throw new BadRequestException(
        'Task link must be a valid HTTP or HTTPS URL',
      );
    }

    if (
      (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') ||
      !parsedUrl.hostname
    ) {
      throw new BadRequestException(
        'Task link must be a valid HTTP or HTTPS URL',
      );
    }

    const title = input.title?.trim() || null;
    if (title !== null && title.length > 200) {
      throw new BadRequestException('Task link title is too long');
    }

    const task = await this.prisma.task.findFirst({
      where: {
        id: input.taskId,
        conversation: { participants: { some: { userId: actor } } },
      },
      select: { id: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const link = await tx.taskLink.create({
        data: {
          taskId: task.id,
          url,
          title,
          creatorId: actor,
        },
      });

      await tx.taskActivity.create({
        data: {
          taskId: task.id,
          actorId: actor,
          action: 'TASK_LINK_ADDED',
          description: 'Added a link to the task',
        },
      });

      return link;
    });
  }

  async deleteTaskLink(input: DeleteTaskLinkInput, actorId: string) {
    const actor = actorId.toLowerCase();

    const link = await this.prisma.taskLink.findFirst({
      where: {
        id: input.linkId,
        task: {
          conversation: { participants: { some: { userId: actor } } },
        },
      },
      select: { id: true, taskId: true },
    });

    if (!link) {
      throw new NotFoundException('Task link not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.taskLink.delete({
        where: { id: link.id },
      });

      await tx.taskActivity.create({
        data: {
          taskId: link.taskId,
          actorId: actor,
          action: 'TASK_LINK_DELETED',
          description: 'Removed a link from the task',
        },
      });

      return deleted;
    });
  }
}
