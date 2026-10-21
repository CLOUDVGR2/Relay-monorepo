/** Current user id decorator module for the Relay NestJS API. */

import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { AuthenticatedRequest } from './gql-auth.guard.js';

// Expose only the user identity attached by GqlAuthGuard.
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const gqlContext = GqlExecutionContext.create(context).getContext<{
      req: AuthenticatedRequest;
    }>();

    const userId = gqlContext.req.user?.id;

    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    return userId;
  },
);
