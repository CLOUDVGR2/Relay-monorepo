/** Service-layer logic for prisma service in the Relay NestJS API. */

import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

// Import the generated Prisma client.
import { PrismaClient } from '../generated/prisma/client.js';

// Provide database access to the application.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  // Connect to the database when NestJS starts.
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  // Disconnect from the database when NestJS shuts down.
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
