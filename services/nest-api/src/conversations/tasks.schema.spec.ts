import { CanActivate } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import type { GraphQLSchema } from 'graphql';
import { describe, expect, it } from 'vitest';
import { GqlAuthGuard } from '../auth/gql-auth.guard.js';
import { TasksResolver } from './tasks.resolver.js';
import { TasksService } from './tasks.service.js';

class TestAuthGuard implements CanActivate {
  canActivate() {
    return true;
  }
}

describe('Tasks GraphQL schema', () => {
  it('builds the task schema with queries, mutations, and types', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
      providers: [
        TasksResolver,
        {
          provide: TasksService,
          useValue: {},
        },
      ],
    })
      .overrideGuard(GqlAuthGuard)
      .useClass(TestAuthGuard)
      .compile();

    try {
      const schemaFactory = moduleRef.get(GraphQLSchemaFactory);
      const schema: GraphQLSchema = await schemaFactory.create([TasksResolver]);

      const queryFields = schema.getQueryType()?.getFields() ?? {};
      const mutationFields = schema.getMutationType()?.getFields() ?? {};

      expect(queryFields).toHaveProperty('listTasks');

      for (const operation of [
        'createTask',
        'updateTask',
        'addTaskChecklistItem',
        'updateTaskChecklistItem',
        'deleteTaskChecklistItem',
        'addTaskLink',
        'deleteTaskLink',
      ]) {
        expect(mutationFields).toHaveProperty(operation);
      }

      for (const typeName of [
        'TaskType',
        'TaskChecklistItemType',
        'TaskLinkType',
        'TaskActivityType',
        'TaskStatus',
        'TaskPriority',
      ]) {
        expect(schema.getTypeMap()).toHaveProperty(typeName);
      }
    } finally {
      await moduleRef.close();
    }
  });
});
