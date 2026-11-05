/** GraphQL types and validated inputs for audio-only call sessions. */

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
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { GraphQLJSON } from 'graphql-type-json';
import {
  CallAudioTrackKind,
  CallRecordingStatus,
  CallSummaryStatus,
  CallTranscriptStatus,
} from '../generated/prisma/enums.js';

export enum CallMediaType {
  AUDIO = 'AUDIO',
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
registerEnumType(CallRecordingStatus, { name: 'CallRecordingStatus' });
registerEnumType(CallAudioTrackKind, { name: 'CallAudioTrackKind' });
registerEnumType(CallTranscriptStatus, { name: 'CallTranscriptStatus' });
registerEnumType(CallSummaryStatus, { name: 'CallSummaryStatus' });


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

  @Field(() => Boolean, { nullable: true })
  recordingConsent!: boolean | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  recordingConsentAt!: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  joinedAt!: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  leftAt!: Date | null;
}

@ObjectType()
export class CallTranscriptType {
  @Field(() => ID)
  id!: string;

  @Field(() => CallTranscriptStatus)
  status!: CallTranscriptStatus;

  @Field(() => String, { nullable: true })
  text!: string | null;

  @Field(() => String, { nullable: true })
  language!: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}

@ObjectType()
export class CallRecordingTrackType {
  @Field(() => ID)
  id!: string;

  @Field(() => CallAudioTrackKind)
  kind!: CallAudioTrackKind;

  @Field()
  contentType!: string;

  @Field(() => Int)
  sampleRate!: number;

  @Field(() => Int)
  channels!: number;

  @Field(() => Int)
  durationMs!: number;

  @Field(() => CallTranscriptType, { nullable: true })
  transcript!: CallTranscriptType | null;
}

@ObjectType()
export class CallRecordingType {
  @Field(() => ID)
  id!: string;

  @Field(() => CallRecordingStatus)
  status!: CallRecordingStatus;

  @Field(() => GraphQLISODateTime, { nullable: true })
  uploadedAt!: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  processedAt!: Date | null;

  @Field(() => [CallRecordingTrackType])
  tracks!: CallRecordingTrackType[];

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}

@ObjectType()
export class CallSummaryType {
  @Field(() => ID)
  id!: string;

  @Field(() => CallSummaryStatus)
  status!: CallSummaryStatus;

  @Field(() => String, { nullable: true })
  summary!: string | null;

  @Field(() => GraphQLJSON, { nullable: true })
  keyPoints!: unknown | null;

  @Field(() => GraphQLJSON, { nullable: true })
  actionItems!: unknown | null;

  @Field(() => String, { nullable: true })
  failureCode!: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  generatedAt!: Date | null;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}

@ObjectType()
export class CallSessionType {
  // Indicates whether this mutation created a new call.
  @Field(() => Boolean, { nullable: true })
  created?: boolean;

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

  @Field(() => CallRecordingType, { nullable: true })
  recording!: CallRecordingType | null;

  @Field(() => CallSummaryType, { nullable: true })
  summary!: CallSummaryType | null;
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

  @Field(() => Boolean, { nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  recordingConsent?: boolean;
}

@InputType()
export class AcceptCallInput {
  @Field(() => ID)
  @IsUUID()
  callId!: string;

  @Field(() => Boolean, { nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  recordingConsent?: boolean;
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
