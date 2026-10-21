/** Request controllers for app controller in the Relay NestJS API. */

import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

/**
 * Root application controller
 * Provides basic health and API information endpoints
 */
@ApiTags('App')
@Controller()
export class AppController {
  /**
   * Root endpoint
   * Returns a simple greeting
   */
  @Get()
  @ApiOperation({ summary: 'Root endpoint', description: 'Returns a simple greeting message' })
  @ApiResponse({ status: 200, description: 'Greeting message' })
  getHello(): string {
    return 'Hello World!';
  }
}
