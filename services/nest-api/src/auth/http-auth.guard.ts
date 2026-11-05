/** Request authorization guard for http auth guard in the Relay NestJS API. */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthUserService } from './auth-user.service.js';
import { JwtAuthService } from './jwt-auth.service.js';

interface AuthenticatedHttpRequest extends Request {
  user?: { id: string };
}

@Injectable()
export class HttpAuthGuard implements CanActivate {
  constructor(
    private readonly jwtAuthService: JwtAuthService,
    private readonly authUserService: AuthUserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request =
      context.switchToHttp().getRequest<AuthenticatedHttpRequest>();

    // Support web cookie sessions and mobile Bearer-token requests.
    const authorization = request.headers.authorization;
    const bearerToken =
      typeof authorization === 'string' &&
      /^Bearer\s+\S+$/i.test(authorization)
        ? authorization.replace(/^Bearer\s+/i, '')
        : undefined;
    const token = request.cookies?.jwt ?? bearerToken;
    const userId = this.jwtAuthService.verifyToken(token);
    const accountExists = await this.authUserService.exists(userId);

    if (!accountExists) {
      throw new UnauthorizedException('Authentication required');
    }

    request.user = { id: userId };
    return true;
  }
}
