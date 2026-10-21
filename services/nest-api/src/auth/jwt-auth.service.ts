/** Service-layer logic for jwt auth service in the Relay NestJS API. */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt, { JwtPayload } from 'jsonwebtoken';

/**
 * Verifies JWTs issued by the existing Express authentication service.
 *
 * The Express service signs { userId } with HS256 and JWT_SECRET.
 * This service accepts that same token format without creating a new one.
 */
@Injectable()
export class JwtAuthService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Verify the cookie token and return its authenticated MongoDB user ID.
   * Never trust an identity that has not passed signature and payload checks.
   */
  verifyToken(token: unknown): string {
    // Missing or non-string credentials must never be accepted.
    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException('Authentication required');
    }

    // Environment validation ensures the secret is configured at startup.
    const secret = this.configService.getOrThrow<string>('JWT_SECRET');

    try {
      // Accept only the signing algorithm used by the Express token issuer.
      const payload = jwt.verify(token, secret, {
        algorithms: ['HS256'],
      });

      // A valid signature alone does not guarantee a usable identity.
      if (
        typeof payload !== 'object' ||
        payload === null ||
        typeof (payload as JwtPayload).userId !== 'string' ||
        !/^[a-fA-F0-9]{24}$/.test((payload as JwtPayload).userId as string)
      ) {
        throw new UnauthorizedException('Authentication required');
      }

      return (payload as JwtPayload).userId as string;
    } catch {
      // Do not reveal whether a token was expired, malformed, or forged.
      throw new UnauthorizedException('Authentication required');
    }
  }
}
