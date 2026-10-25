/** GraphQL types and validated inputs for conversation tasks. */

import {
  Field,
  GraphQLISODateTime,
  ID,
  InputType,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export enum TaskStatusType {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
}

export enum TaskPriorityType {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

registerEnumType(TaskStatusType, { name: 'TaskStatus' });
registerEnumType(TaskPriorityType, { name: 'TaskPriority' });

@ObjectType()
export class TaskActivityType {
  @Field(() => ID)
  id!: string;

  @Field()
  actorId!: string;

  @Field()
  action!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;
}

@ObjectType()
export class TaskChecklistItemType {
  @Field(() => ID)
  id!: string;

  @Field()
  text!: string;

  @Field()
  completed!: boolean;

  @Field()
  position!: number;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}

@ObjectType()
export class TaskLinkType {
  @Field(() => ID)
  id!: string;

  @Field()
  url!: string;

  @Field(() => String, { nullable: true })
  title!: string | null;

  @Field()
  creatorId!: string;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;
}

@ObjectType()
export class TaskType {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  conversationId!: string;

  @Field(() => ID, { nullable: true })
  sourceMessageId!: string | null;

  @Field()
  title!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field()
  creatorId!: string;

  @Field(() => String, { nullable: true })
  assigneeId!: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  dueDate!: Date | null;

  @Field(() => TaskPriorityType)
  priority!: TaskPriorityType;

  @Field(() => TaskStatusType)
  status!: TaskStatusType;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;

  @Field(() => [TaskChecklistItemType])
  checklistItems!: TaskChecklistItemType[];

  @Field(() => [TaskActivityType])
  activities!: TaskActivityType[];

  @Field(() => [TaskLinkType])
  links!: TaskLinkType[];
}

@InputType()
export class CreateTaskInput {
  @Field(() => ID)
  @IsUUID()
  conversationId!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  sourceMessageId?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsMongoId()
  assigneeId?: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  @IsOptional()
  @IsDate()
  dueDate?: Date | null;

  @Field(() => TaskPriorityType, { defaultValue: TaskPriorityType.MEDIUM })
  @IsOptional()
  @IsEnum(TaskPriorityType)
  priority?: TaskPriorityType = TaskPriorityType.MEDIUM;
}

@InputType()
export class ListTasksInput {
  @Field(() => ID)
  @IsUUID()
  conversationId!: string;

  @Field({ nullable: true, defaultValue: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;

  @Field({ nullable: true, defaultValue: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset: number = 0;

  @Field(() => TaskStatusType, { nullable: true })
  @IsOptional()
  @IsEnum(TaskStatusType)
  status?: TaskStatusType;
}

@InputType()
export class UpdateTaskInput {
  @Field(() => ID)
  @IsUUID()
  taskId!: string;

  @Field({ nullable: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsMongoId()
  assigneeId?: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  @IsOptional()
  @IsDate()
  dueDate?: Date | null;

  @Field(() => TaskPriorityType, { nullable: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(TaskPriorityType)
  priority?: TaskPriorityType;

  @Field(() => TaskStatusType, { nullable: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(TaskStatusType)
  status?: TaskStatusType;
}

@InputType()
export class AddTaskChecklistItemInput {
  @Field(() => ID)
  @IsUUID()
  taskId!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  position?: number;
}

@InputType()
export class UpdateTaskChecklistItemInput {
  @Field(() => ID)
  @IsUUID()
  itemId!: string;

  @Field({ nullable: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text?: string;

  @Field({ nullable: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  completed?: boolean;
}

@InputType()
export class DeleteTaskChecklistItemInput {
  @Field(() => ID)
  @IsUUID()
  itemId!: string;
}

@InputType()
export class AddTaskLinkInput {
  @Field(() => ID)
  @IsUUID()
  taskId!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  url!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;
}

@InputType()
export class DeleteTaskLinkInput {
  @Field(() => ID)
  @IsUUID()
  linkId!: string;
}
