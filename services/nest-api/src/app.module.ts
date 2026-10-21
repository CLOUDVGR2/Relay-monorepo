/** App module module for the Relay NestJS API. */

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisModule, RedisToken } from '@nestjs-redis/client';
import { RedisThrottlerStorage } from '@nestjs-redis/throttler-storage';
import type { RedisClientType } from 'redis';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import type { Request, Response } from 'express';
import { MongooseModule } from '@nestjs/mongoose';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnvironment } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AIModule } from './ai/ai.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ConversationsModule } from './conversations/conversations.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { GraphqlResolver } from './graphql/graphql.resolver.js';
import { GraphqlThrottlerGuard } from './common/guards/graphql-throttler.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    RedisModule.forRootAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        options: {
          url: configService.getOrThrow<string>('REDIS_URL'),
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService, RedisToken()],
      useFactory: (_configService: ConfigService, redis: RedisClientType) => ({
        throttlers: [
          {
            name: 'global',
            limit: 120,
            ttl: 60_000,
            setHeaders: true,
          },
        ],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      graphiql: true,
      autoSchemaFile: true,
      sortSchema: true,
      path: '/graphql',
      context: ({ req, res }: { req: Request; res: Response }) => ({
        req,
        res,
      }),
      formatError: (formattedError) => {
        const status = formattedError.extensions?.status;
        const originalCode = formattedError.extensions?.code;

        return {
          message: formattedError.message,
          locations: formattedError.locations,
          path: formattedError.path,
          extensions: {
            code:
              status === 404
                ? 'NOT_FOUND'
                : status === 400 || originalCode === 'BAD_REQUEST'
                  ? 'BAD_USER_INPUT'
                  : originalCode,
          },
        };
      },
    }),
    AIModule,
    AuthModule,
    HealthModule,
    PrismaModule,
    ConversationsModule,
    JobsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    GraphqlResolver,
    {
      provide: APP_GUARD,
      useClass: GraphqlThrottlerGuard,
    },
  ],
})
export class AppModule {}
