/** Conversation types module for the Relay NestJS API. */

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
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Represent a persisted chat message in GraphQL responses.
@ObjectType()
export class ChatMessageType {
  // Expose the database-generated message identifier.
  @Field(() => ID)
  id!: string;

  // Identify the conversation that owns this message.
  @Field(() => ID)
  conversationId!: string;

  // Identify the authenticated account that sent the message.
  // The server, rather than the client, must determine this identity.
  @Field()
  senderId!: string;

  // Return the stored message body.
  @Field()
  text!: string;

  // Expose the server-generated creation time in ISO date-time format.
  @Field(() => GraphQLISODateTime)
  createdAt!: Date;
}

// Keep GraphQL participant roles aligned with the Prisma enum.
export enum ConversationParticipantRoleType {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

registerEnumType(ConversationParticipantRoleType, {
  name: 'ConversationParticipantRole',
});

// Represent a user's membership in a conversation.
@ObjectType()
export class ConversationParticipantType {
  @Field(() => ID)
  userId!: string;

  @Field(() => ConversationParticipantRoleType)
  role!: ConversationParticipantRoleType;

  @Field(() => GraphQLISODateTime)
  joinedAt!: Date;
}

// Represent a conversation and its messages in GraphQL responses.
@ObjectType()
export class ConversationType {
  // Expose the PostgreSQL-generated conversation UUID.
  @Field(() => ID)
  id!: string;

  // Indicates whether this mutation created a new conversation.
  @Field(() => Boolean, { nullable: true })
  created?: boolean;

  // Record when the conversation was created.
  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  // Record the latest update managed by Prisma.
  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;

  // Optional display name, mainly useful for group conversations.
  @Field(() => String, { nullable: true })
  name?: string | null;

  // Optional description for the conversation.
  @Field(() => String, { nullable: true })
  description?: string | null;

  // Return participant memberships selected by the service.
  @Field(() => [ConversationParticipantType])
  participants!: ConversationParticipantType[];

  // Return the messages selected by the service.
  @Field(() => [ChatMessageType])
  messages!: ChatMessageType[];
}

// Define the data clients provide when creating a conversation.
// The authenticated creator is added separately by the service.
@InputType()
export class CreateConversationInput {
  // Accept MongoDB account IDs for the intended participants.
  @Field(() => [String])
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @Matches(/^[a-fA-F0-9]{24}$/, {
    each: true,
    message: 'Each participant ID must be a valid MongoDB ObjectId',
  })
  participantIds!: string[];

  // Optional metadata can be supplied when creating a group.
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}

// Identify a conversation to hide from the authenticated user's list.
@InputType()
export class HideConversationInput {
  @Field(() => ID)
  @IsUUID()
  conversationId!: string;
}

// Define metadata an admin can update on an existing conversation.
@InputType()
export class UpdateConversationDetailsInput {
  @Field(() => ID)
  @IsUUID()
  conversationId!: string;

  // Omit a field to leave it unchanged; pass null to clear it.
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}

// Define participants that an existing conversation admin can add.
@InputType()
export class AddConversationParticipantsInput {
  @Field(() => ID)
  @IsUUID()
  conversationId!: string;

  @Field(() => [String])
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @Matches(/^[a-fA-F0-9]{24}$/, {
    each: true,
    message: 'Each participant ID must be a valid MongoDB ObjectId',
  })
  participantIds!: string[];
}

// Define the data clients provide when sending a message.
// senderId is intentionally excluded so a client cannot impersonate another user.
@InputType()
export class CreateMessageInput {
  // Require a valid UUID for the destination conversation.
  @Field(() => ID)
  @IsUUID()
  conversationId!: string;

  // Reject empty text and limit the maximum message payload.
  @Field()
  @IsNotEmpty()
  @MaxLength(5000)
  text!: string;
}

// Return a page of messages together with its pagination metadata.
@ObjectType()
export class PaginatedMessagesType {
  // Contain the messages included in this response page.
  @Field(() => [ChatMessageType])
  items!: ChatMessageType[];

  // Identify the cursor used to request older messages, if another page exists.
  @Field(() => ID, { nullable: true })
  nextCursor!: string | null;

  // Tell the client whether another page of older messages is available.
  @Field()
  hasMore!: boolean;
}

// Validate the arguments used to retrieve a page of conversation messages.
@InputType()
export class ConversationMessagesInput {
  // Identify the conversation whose messages are requested.
  @Field(() => ID)
  @IsUUID()
  conversationId!: string;

  // Bound database work per request and default to 20 messages.
  @Field(() => Int, { defaultValue: 20 })
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  // Optionally request messages older than the message identified by this cursor.
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  before?: string;
}

// Represent one task extracted from an authorized conversation transcript.
@ObjectType()
export class ConversationActionItemType {
  @Field()
  task!: string;

  @Field(() => String, { nullable: true })
  owner!: string | null;

  @Field(() => String, { nullable: true })
  due_date!: string | null;
}

// Return the structured analysis produced by the internal AI service.
@ObjectType()
export class ConversationAnalysisType {
  @Field()
  summary!: string;

  @Field(() => [String])
  decisions!: string[];

  @Field(() => [ConversationActionItemType])
  action_items!: ConversationActionItemType[];
}

// Accept only a conversation ID; transcript content must be loaded server-side.
@InputType()
export class SummarizeConversationInput {
  @Field(() => ID)
  @IsUUID()
  conversationId!: string;
}
