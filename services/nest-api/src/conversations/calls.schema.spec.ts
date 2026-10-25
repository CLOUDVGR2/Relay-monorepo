import { CanActivate } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import type { GraphQLSchema } from 'graphql';
import { describe, expect, it } from 'vitest';
import { GqlAuthGuard } from '../auth/gql-auth.guard.js';
import { CallsResolver } from './calls.resolver.js';
import { CallsService } from './calls.service.js';

class TestAuthGuard implements CanActivate {
  canActivate() {
    return true;
  }
}

describe('Calls GraphQL schema', () => {
  it('builds the call schema with authenticated queries, mutations, and types', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
      providers: [
        CallsResolver,
        {
          provide: CallsService,
          useValue: {},
        },
      ],
    })
      .overrideGuard(GqlAuthGuard)
      .useClass(TestAuthGuard)
      .compile();

    try {
      const schemaFactory = moduleRef.get(GraphQLSchemaFactory);
      const schema: GraphQLSchema =
        await schemaFactory.create([CallsResolver]);

      const queryFields = schema.getQueryType()?.getFields() ?? {};
      const mutationFields = schema.getMutationType()?.getFields() ?? {};

      for (const operation of ['callHistory', 'callSession']) {
        expect(queryFields).toHaveProperty(operation);
      }

      for (const operation of [
        'createCall',
        'acceptCall',
        'declineCall',
        'endCall',
      ]) {
        expect(mutationFields).toHaveProperty(operation);
      }

      for (const typeName of [
        'CallSessionType',
        'CallParticipantType',
        'CallType',
        'CallStatus',
        'CallParticipantStatus',
      ]) {
        expect(schema.getTypeMap()).toHaveProperty(typeName);
      }
    } finally {
      await moduleRef.close();
    }
  });
});
