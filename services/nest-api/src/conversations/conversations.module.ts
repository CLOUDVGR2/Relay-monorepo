/** Conversations module module for the Relay NestJS API. */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ConversationsResolver } from './conversations.resolver.js';
import { ConversationsService } from './conversations.service.js';

// Assemble the conversation feature with its database and identity dependencies.
@Module({
  imports: [PrismaModule, AuthModule],
  providers: [ConversationsService, ConversationsResolver],
})
export class ConversationsModule {}
