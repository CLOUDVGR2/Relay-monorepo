/** Request controllers for jobs controller in the Relay NestJS API. */

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { HttpAuthGuard } from '../auth/http-auth.guard.js';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/dto/api-error-response.dto.js';
import {
  JobHistoryResponseDto,
  JobStatusResponseDto,
  SubmittedJobResponseDto,
} from './dto/job-response.dto.js';
import { SubmitJobDto } from './dto/submit-job.dto.js';
import { JobsService } from './jobs.service.js';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@ApiTags('Jobs')
@ApiCookieAuth('jwt')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({
  description: 'Authentication required.',
  type: ApiErrorResponseDto,
})
@Controller('jobs')
@UseGuards(HttpAuthGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a welcome job' })
  @ApiCreatedResponse({
    description: 'The welcome job was accepted for processing.',
    type: SubmittedJobResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'The submitted job data is invalid.',
    type: ApiErrorResponseDto,
  })
  @ApiBadGatewayResponse({
    description: 'The job service returned an invalid response.',
    type: ApiErrorResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'The job service is temporarily unavailable.',
    type: ApiErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'An unexpected server error occurred.',
    type: ApiErrorResponseDto,
  })
  submit(
    @Body() input: SubmitJobDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.jobsService.submitWelcomeJob(
      input.message,
      request.user.id,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List the authenticated user’s jobs' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum number of jobs to return (default: 50; minimum: 1; maximum: 100).',
    schema: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 50,
      example: 50,
    },
  })
  @ApiOkResponse({
    description: 'The authenticated user’s job history.',
    type: JobHistoryResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'The limit query parameter is not a valid integer.',
    type: ApiErrorResponseDto,
  })
  @ApiBadGatewayResponse({
    description: 'The job service returned invalid history.',
    type: ApiErrorResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'The job service is temporarily unavailable.',
    type: ApiErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'An unexpected server error occurred.',
    type: ApiErrorResponseDto,
  })
  history(
    @Req() request: AuthenticatedRequest,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.jobsService.getJobHistory(request.user.id, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a job by ID' })
  @ApiOkResponse({
    description: 'The requested job.',
    type: JobStatusResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'The job was not found for the authenticated user.',
    type: ApiErrorResponseDto,
  })
  @ApiBadGatewayResponse({
    description: 'The job service returned an invalid response.',
    type: ApiErrorResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'The job service is temporarily unavailable.',
    type: ApiErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'An unexpected server error occurred.',
    type: ApiErrorResponseDto,
  })
  detail(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.jobsService.getJobDetail(request.user.id, id);
  }
}
