/** Request controllers for health controller in the Relay NestJS API. */

import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Connection } from 'mongoose';
import { ApiErrorResponseDto } from '../common/dto/api-error-response.dto.js';

/**
 * Liveness checks the API process.
 * Readiness checks whether the configured MongoDB database responds.
 */
@ApiTags('Health')
@SkipThrottle({ global: true })
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Check API liveness',
    description:
      'Confirms that the API process is responding. ' +
      'This endpoint does not guarantee database or broker availability.',
  })
  @ApiOkResponse({
    description: 'The API process is responding.',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
      },
      required: ['status'],
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'An unexpected server error occurred.',
    type: ApiErrorResponseDto,
  })
  checkHealth(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Check application database readiness',
    description:
      'Pings the MongoDB database configured for this NestJS application.',
  })
  @ApiOkResponse({
    description: 'The database is responding.',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ready' },
        checks: {
          type: 'object',
          properties: {
            database: { type: 'string', example: 'ok' },
          },
        },
      },
    },
  })
  async checkReadiness(): Promise<{
    status: string;
    checks: { database: string };
  }> {
    const database = this.connection.db;

    if (!database) {
      throw new ServiceUnavailableException({
        status: 'error',
        checks: { database: 'unavailable' },
      });
    }

    try {
      await database.admin().ping();

      return {
        status: 'ready',
        checks: { database: 'ok' },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        checks: { database: 'unavailable' },
      });
    }
  }
}
