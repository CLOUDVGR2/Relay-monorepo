/** AI module for the Relay NestJS API. */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { HttpAuthGuard } from '../auth/http-auth.guard.js';
import { AIController } from './ai.controller.js';
import { AIService } from './ai.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AIController],
  providers: [AIService, HttpAuthGuard],
  exports: [AIService],
})
export class AIModule {}
