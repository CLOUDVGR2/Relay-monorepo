/** Prisma module module for the Relay NestJS API. */

import { Module } from '@nestjs/common';

// Import the Prisma service.
import { PrismaService } from './prisma.service.js';

// Register and share the Prisma service.
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
