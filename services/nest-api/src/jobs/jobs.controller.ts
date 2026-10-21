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
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SubmitJobDto } from './dto/submit-job.dto.js';
import { JobsService } from './jobs.service.js';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@ApiTags('Jobs')
@ApiCookieAuth('jwt')
@ApiUnauthorizedResponse({ description: 'Authentication required.' })
@Controller('jobs')
@UseGuards(HttpAuthGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a welcome job' })
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
  history(
    @Req() request: AuthenticatedRequest,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.jobsService.getJobHistory(request.user.id, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a job by ID' })
  detail(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.jobsService.getJobDetail(request.user.id, id);
  }
}
