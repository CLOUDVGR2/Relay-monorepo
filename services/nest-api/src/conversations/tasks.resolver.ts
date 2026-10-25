/** Authenticated GraphQL operations for conversation tasks. */

import { UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  GqlAuthGuard,
  type AuthenticatedRequest,
} from '../auth/gql-auth.guard.js';
import { TasksService } from './tasks.service.js';
import {
  AddTaskChecklistItemInput,
  DeleteTaskChecklistItemInput,
  UpdateTaskChecklistItemInput,
  AddTaskLinkInput,
  DeleteTaskLinkInput,
  TaskLinkType,
  CreateTaskInput,
  ListTasksInput,
  TaskChecklistItemType,
  TaskType,
  UpdateTaskInput,
} from './task.types.js';

@Resolver(() => TaskType)
@UseGuards(GqlAuthGuard)
export class TasksResolver {
  constructor(private readonly tasksService: TasksService) {}

  @Mutation(() => TaskType, { name: 'createTask' })
  createTask(
    @Args('input') input: CreateTaskInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    // The authenticated identity is authoritative; never accept creatorId
    // from client-controlled GraphQL input.
    return this.tasksService.create(input, request.user!.id);
  }

  @Query(() => [TaskType], { name: 'listTasks' })
  listTasks(
    @Args('input') input: ListTasksInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.tasksService.list(input, request.user!.id);
  }

  @Mutation(() => TaskType, { name: 'updateTask' })
  updateTask(
    @Args('input') input: UpdateTaskInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.tasksService.update(input, request.user!.id);
  }

  @Mutation(() => TaskChecklistItemType, { name: 'addTaskChecklistItem' })
  addTaskChecklistItem(
    @Args('input') input: AddTaskChecklistItemInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.tasksService.addChecklistItem(input, request.user!.id);
  }

  @Mutation(() => TaskChecklistItemType, { name: 'updateTaskChecklistItem' })
  updateTaskChecklistItem(
    @Args('input') input: UpdateTaskChecklistItemInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.tasksService.updateChecklistItem(input, request.user!.id);
  }

  @Mutation(() => TaskChecklistItemType, { name: 'deleteTaskChecklistItem' })
  deleteTaskChecklistItem(
    @Args('input') input: DeleteTaskChecklistItemInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.tasksService.deleteChecklistItem(input, request.user!.id);
  }

  @Mutation(() => TaskLinkType, { name: 'addTaskLink' })
  addTaskLink(
    @Args('input') input: AddTaskLinkInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.tasksService.addTaskLink(input, request.user!.id);
  }

  @Mutation(() => TaskLinkType, { name: 'deleteTaskLink' })
  deleteTaskLink(
    @Args('input') input: DeleteTaskLinkInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.tasksService.deleteTaskLink(input, request.user!.id);
  }
}
