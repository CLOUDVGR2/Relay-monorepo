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

    // Validate the existing Express cookie before trusting any identity.
    const userId = this.jwtAuthService.verifyToken(request.cookies?.jwt);

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
