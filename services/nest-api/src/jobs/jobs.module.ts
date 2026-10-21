/** Jobs module module for the Relay NestJS API. */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { HttpAuthGuard } from '../auth/http-auth.guard.js';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';

@Module({
  imports: [AuthModule],
  controllers: [JobsController],
  providers: [HttpAuthGuard, JobsService],
})
export class JobsModule {}
