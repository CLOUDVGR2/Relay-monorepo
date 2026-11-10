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
import { CallRecordingStorageService } from './call-recording-storage.service.js';
import { InternalMediaSessionsController } from './internal-media-sessions.controller.js';
import { CallRecordingUploadsController } from './call-recording-uploads.controller.js';
import { CallRecordingUploadsService } from './call-recording-uploads.service.js';

@Module({
  imports: [PrismaModule, AuthModule, AIModule],
  controllers: [
    InternalMediaSessionsController,
    CallRecordingUploadsController,
  ],
  providers: [
    ConversationsService,
    ConversationsResolver,
    TasksService,
    TasksResolver,
    CallsService,
    CallsResolver,
    CallEventsPublisher,
    CallRecordingStorageService,
    CallRecordingUploadsService,
  ],
})
export class ConversationsModule {}
