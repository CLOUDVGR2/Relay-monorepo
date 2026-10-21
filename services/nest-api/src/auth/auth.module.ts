/** Auth module module for the Relay NestJS API. */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthUserService } from './auth-user.service.js';
import { AUTH_USER_MODEL, authUserSchema } from './auth-user.schema.js';
import { GqlAuthGuard } from './gql-auth.guard.js';
import { JwtAuthService } from './jwt-auth.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: AUTH_USER_MODEL,
        schema: authUserSchema,
      },
    ]),
  ],
  providers: [AuthUserService, GqlAuthGuard, JwtAuthService],
  exports: [AuthUserService, GqlAuthGuard, JwtAuthService],
})
export class AuthModule {}
