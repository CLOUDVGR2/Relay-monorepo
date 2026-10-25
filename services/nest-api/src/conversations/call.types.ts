/** GraphQL types and validated inputs for audio/video call sessions. */

import {
  Field,
  GraphQLISODateTime,
  ID,
  InputType,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export enum CallMediaType {
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
}

export enum CallSessionStatus {
  RINGING = 'RINGING',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
  CANCELLED = 'CANCELLED',
}

export enum CallInviteStatus {
  INVITED = 'INVITED',
  RINGING = 'RINGING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  MISSED = 'MISSED',
  LEFT = 'LEFT',
}

registerEnumType(CallMediaType, { name: 'CallType' });
registerEnumType(CallSessionStatus, { name: 'CallStatus' });
registerEnumType(CallInviteStatus, { name: 'CallParticipantStatus' });

@ObjectType()
export class CallParticipantType {
  @Field(() => ID)
  id!: string;

  @Field()
  userId!: string;

  @Field(() => CallInviteStatus)
  status!: CallInviteStatus;

  @Field(() => GraphQLISODateTime)
  invitedAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  respondedAt!: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  joinedAt!: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  leftAt!: Date | null;
}

@ObjectType()
export class CallSessionType {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  conversationId!: string;

  @Field()
  initiatorId!: string;

  @Field(() => CallMediaType)
  type!: CallMediaType;

  @Field(() => CallSessionStatus)
  status!: CallSessionStatus;

  @Field(() => GraphQLISODateTime, { nullable: true })
  startedAt!: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  answeredAt!: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  endedAt!: Date | null;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;

  @Field(() => [CallParticipantType])
  participants!: CallParticipantType[];
}

@InputType()
export class CreateCallInput {
  @Field(() => ID)
  @IsUUID()
  conversationId!: string;

  @Field(() => CallMediaType)
  @IsEnum(CallMediaType)
  type!: CallMediaType;

  /**
   * If omitted, invite every other member of the conversation.
   * If supplied, every ID must already belong to the conversation.
   */
  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(49)
  @IsMongoId({ each: true })
  participantIds?: string[];
}

@InputType()
export class CallActionInput {
  @Field(() => ID)
  @IsUUID()
  callId!: string;
}

@InputType()
export class CallHistoryInput {
  @Field(() => Int, { nullable: true, defaultValue: 25 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;
}
