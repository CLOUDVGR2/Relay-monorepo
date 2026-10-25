/** Request authorization guard for gql auth guard in the Relay NestJS API. */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request } from 'express';
import { AuthUserService } from './auth-user.service.js';
import { JwtAuthService } from './jwt-auth.service.js';

// Attach the verified identity without overriding Express request properties.
export interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

@Injectable()
export class GqlAuthGuard implements CanActivate {
  constructor(
    private readonly jwtAuthService: JwtAuthService,
    private readonly authUserService: AuthUserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gqlContext = GqlExecutionContext.create(context).getContext<{
      req: AuthenticatedRequest;
    }>();

    const request = gqlContext.req;

    // Support the existing web cookie and the mobile bearer-token client.
    // Both credentials go through the same signature and payload validation.
    const authorization = request.headers.authorization;
    const bearerToken =
      typeof authorization === 'string' &&
      /^Bearer\s+\S+$/i.test(authorization)
        ? authorization.replace(/^Bearer\s+/i, '')
        : undefined;
    const token = request.cookies?.jwt ?? bearerToken;
    const userId = this.jwtAuthService.verifyToken(token);

    // Preserve the Express middleware's deleted-account protection.
    const accountExists = await this.authUserService.exists(userId);

    if (!accountExists) {
      throw new UnauthorizedException('Authentication required');
    }

    // Resolvers must use this verified identity, never a client-supplied ID.
    request.user = { id: userId };

    return true;
  }
}
