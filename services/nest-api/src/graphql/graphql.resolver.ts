
/** Graphql resolver module for the Relay NestJS API. */

import { Query, Resolver } from '@nestjs/graphql';

@Resolver()
export class GraphqlResolver {
  /**
   * A simple query used to verify that the GraphQL API is working.
   * This is a foundation check, not a business-domain operation.
   */
  @Query(() => String, { name: 'hello' })
  hello(): string {
    return 'Hello from GraphQL!';
  }
}
