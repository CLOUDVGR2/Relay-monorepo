/** Ai module module for the Relay NestJS API. */

import { Module } from '@nestjs/common';
import { AIService } from './ai.service.js';

@Module({
  providers: [AIService],
  exports: [AIService],
})
export class AIModule {}
