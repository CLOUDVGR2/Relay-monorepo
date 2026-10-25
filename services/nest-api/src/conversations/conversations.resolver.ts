/** Conversations resolver module for the Relay NestJS API. */

import { UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import {
  GqlAuthGuard,
  type AuthenticatedRequest,
} from '../auth/gql-auth.guard.js';
import { ConversationsService } from './conversations.service.js';
import { AIService } from '../ai/ai.service.js';
import {
  AddConversationParticipantsInput,
  ChatMessageType,
  ConversationMessagesInput,
  ConversationType,
  CreateConversationInput,
  CreateMessageInput,
  PaginatedMessagesType,
  UpdateConversationDetailsInput,
  ConversationAnalysisType,
  SummarizeConversationInput,
} from './conversation.types.js';

// Expose conversation operations through GraphQL.
@Resolver(() => ConversationType)
// Require a verified session for every query and mutation in this resolver.
@UseGuards(GqlAuthGuard)
export class ConversationsResolver {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly aiService: AIService,
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


  // Analyze only server-retrieved messages after the service verifies membership.
  @Query(() => ConversationAnalysisType, { name: 'summarizeConversation' })
  async summarizeConversation(
    @Args('input') input: SummarizeConversationInput,
    @Context('req') request: AuthenticatedRequest,
  ): Promise<ConversationAnalysisType> {
    // Never accept a transcript or speaker identity from client-controlled input.
    const messages = await this.conversationsService.findMessagesForSummary(
      input.conversationId,
      request.user!.id,
    );

    return this.aiService.analyzeConversation(
      messages.map((message) => ({
        sender: message.senderId,
        text: message.text,
      })),
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
