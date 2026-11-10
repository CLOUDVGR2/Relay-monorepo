/** Conversations resolver module for the Relay NestJS API. */

import { UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import {
  GqlAuthGuard,
  type AuthenticatedRequest,
} from '../auth/gql-auth.guard.js';
import { ConversationsService } from './conversations.service.js';
import {
  AddConversationParticipantsInput,
  ChatMessageType,
  ConversationMessagesInput,
  ConversationType,
  CreateConversationInput,
  HideConversationInput,
  CreateMessageInput,
  PaginatedMessagesType,
  UpdateConversationDetailsInput,
} from './conversation.types.js';

// Expose conversation operations through GraphQL.
@Resolver(() => ConversationType)
// Require a verified session for every query and mutation in this resolver.
@UseGuards(GqlAuthGuard)
export class ConversationsResolver {
  constructor(
    private readonly conversationsService: ConversationsService,
  ) {}

  // Load message history only when the GraphQL selection requests this field.
  @ResolveField(() => [ChatMessageType], { name: 'messages' })
  messages(
    @Parent() conversation: ConversationType,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.conversationsService.findAllMessages(
      conversation.id,
      request.user!.id,
    );
  }

  // Return only conversations in which the authenticated account participates.
  @Query(() => [ConversationType], { name: 'conversations' })
  findAll(@Context('req') request: AuthenticatedRequest) {
    return this.conversationsService.findAll(request.user!.id);
  }

  // Return a bounded page of messages from an authorized conversation.
  @Query(() => PaginatedMessagesType, { name: 'conversationMessages' })
  conversationMessages(
    @Args('input') input: ConversationMessagesInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    // The service enforces membership and validates the pagination cursor.
    return this.conversationsService.findMessages(
      input.conversationId,
      request.user!.id,
      input.limit,
      input.before,
    );
  }


  // Create a conversation with the authenticated account and requested participants.
  @Mutation(() => ConversationType, { name: 'createConversation' })
  createConversation(
    @Args('input') input: CreateConversationInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    // Never accept the creator's identity from client-controlled input.
    return this.conversationsService.create(
      request.user!.id,
      input.participantIds,
      input.name,
      input.description,
    );
  }

  // Hide a conversation only for the authenticated account.
  @Mutation(() => Boolean, { name: 'hideConversation' })
  hideConversation(
    @Args('input') input: HideConversationInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.conversationsService.hideConversation(
      input.conversationId,
      request.user!.id,
    );
  }

  // Update group metadata; the service enforces admin authorization.
  @Mutation(() => ConversationType, { name: "updateConversationDetails" })
  updateConversationDetails(
    @Args("input") input: UpdateConversationDetailsInput,
    @Context("req") request: AuthenticatedRequest,
  ) {
    return this.conversationsService.updateDetails(
      input.conversationId,
      request.user!.id,
      input.name,
      input.description,
    );
  }

  // Add members to a conversation; the service enforces admin authorization.
  @Mutation(() => ConversationType, { name: 'addConversationParticipants' })
  addConversationParticipants(
    @Args('input') input: AddConversationParticipantsInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.conversationsService.addParticipants(
      input.conversationId,
      request.user!.id,
      input.participantIds,
    );
  }

  // Save a message as the authenticated user.
  @Mutation(() => ChatMessageType, { name: 'createMessage' })
  createMessage(
    @Args('input') input: CreateMessageInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    // The JWT guard establishes the sender identity; input contains no senderId.
    return this.conversationsService.createMessage(
      input.conversationId,
      request.user!.id,
      input.text,
    );
  }
}
