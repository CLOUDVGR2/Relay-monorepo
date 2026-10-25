/** Conversations module for the Relay NestJS API. */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AIModule } from '../ai/ai.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ConversationsResolver } from './conversations.resolver.js';
import { ConversationsService } from './conversations.service.js';
import { TasksService } from './tasks.service.js';
import { TasksResolver } from './tasks.resolver.js';
import { CallsService } from './calls.service.js';
import { CallsResolver } from './calls.resolver.js';
import { CallEventsPublisher } from './call-events.publisher.js';

@Module({
  imports: [PrismaModule, AuthModule, AIModule],
  providers: [
    ConversationsService,
    ConversationsResolver,
    TasksService,
    TasksResolver,
    CallsService,
    CallsResolver,
    CallEventsPublisher,
  ],
})
export class ConversationsModule {}
