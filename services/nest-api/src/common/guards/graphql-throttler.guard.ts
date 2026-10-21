/** Request authorization guard for graphql throttler guard in the Relay NestJS API. */

import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';

@Injectable()
export class GraphqlThrottlerGuard extends ThrottlerGuard {
  protected getRequestResponse(context: ExecutionContext): {
    req: Record<string, any>;
    res: Record<string, any>;
  } {
    if (context.getType<string>() === 'graphql') {
      const gqlContext = GqlExecutionContext.create(context).getContext<{
        req: Request;
        res: Response;
      }>();

      return {
        req: gqlContext.req as unknown as Record<string, any>,
        res: gqlContext.res as unknown as Record<string, any>,
      };
    }

    return super.getRequestResponse(context);
  }
}
