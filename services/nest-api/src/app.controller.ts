/** Request controllers for app controller in the Relay NestJS API. */

import { Controller, Get } from '@nestjs/common';
import { ApiInternalServerErrorResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from './common/dto/api-error-response.dto.js';

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
  @ApiOkResponse({
    description: 'Greeting message.',
    schema: { type: 'string', example: 'Hello World!' },
  })
  @ApiInternalServerErrorResponse({
    description: 'An unexpected server error occurred.',
    type: ApiErrorResponseDto,
  })
  getHello(): string {
    return 'Hello World!';
  }
}
