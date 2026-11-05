/** Authenticated GraphQL operations for call sessions. */

import { UseGuards } from '@nestjs/common';
import {
  Args,
  Context,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import {
  GqlAuthGuard,
  type AuthenticatedRequest,
} from '../auth/gql-auth.guard.js';
import {
  AcceptCallInput,
  CallActionInput,
  CallHistoryInput,
  CallSessionType,
  CreateCallInput,
} from './call.types.js';
import { CallsService } from './calls.service.js';

@Resolver(() => CallSessionType)
@UseGuards(GqlAuthGuard)
export class CallsResolver {
  constructor(private readonly callsService: CallsService) {}

  @Mutation(() => CallSessionType, { name: 'createCall' })
  createCall(
    @Args('input') input: CreateCallInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.callsService.create(input, request.user!.id);
  }

  @Mutation(() => CallSessionType, { name: 'acceptCall' })
  acceptCall(
    @Args('input') input: AcceptCallInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.callsService.accept(input, request.user!.id);
  }

  @Mutation(() => CallSessionType, { name: 'declineCall' })
  declineCall(
    @Args('input') input: CallActionInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.callsService.decline(input, request.user!.id);
  }

  @Mutation(() => CallSessionType, { name: 'endCall' })
  endCall(
    @Args('input') input: CallActionInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.callsService.end(input, request.user!.id);
  }

  @Mutation(() => CallSessionType, { name: 'generateCallSummary' })
  generateCallSummary(
    @Args('input') input: CallActionInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.callsService.generateSummary(input, request.user!.id);
  }

  @Mutation(() => Boolean, { name: 'deleteCallHistory' })
  deleteCallHistory(
    @Args('input') input: CallActionInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.callsService.deleteCallHistory(input, request.user!.id);
  }

  @Query(() => [CallSessionType], { name: 'callHistory' })
  callHistory(
    @Args('input', { type: () => CallHistoryInput, nullable: true }) input: CallHistoryInput | undefined,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.callsService.history(input ?? { limit: 25 }, request.user!.id);
  }

  @Query(() => CallSessionType, { name: 'callSession' })
  callSession(
    @Args('input') input: CallActionInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.callsService.getCall(input, request.user!.id);
  }
}
