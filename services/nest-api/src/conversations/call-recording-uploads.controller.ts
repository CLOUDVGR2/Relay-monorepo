/** Authenticated call recording upload endpoints. */

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { HttpAuthGuard } from '../auth/http-auth.guard.js';
import { ApiErrorResponseDto } from '../common/dto/api-error-response.dto.js';
import {
  CompleteRecordingUploadResponseDto,
  RecordingPlaybackResponseDto,
  RecordingUploadUrlResponseDto,
} from './dto/call-recording-response.dto.js';
import { CompleteRecordingUploadDto } from './dto/complete-recording-upload.dto.js';
import { CallRecordingUploadsService } from './call-recording-uploads.service.js';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@ApiTags('Call recording uploads')
@ApiCookieAuth('jwt')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({
  description: 'Authentication required.',
  type: ApiErrorResponseDto,
})
@Controller('calls')
@UseGuards(HttpAuthGuard)
export class CallRecordingUploadsController {
  constructor(private readonly uploadsService: CallRecordingUploadsService) {}

  @Get(':callId/recording')
  @ApiOperation({
    summary: 'Get authorized call recording playback URLs',
  })
  @ApiOkResponse({
    description: 'Playback URLs for the ready recording tracks.',
    type: RecordingPlaybackResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'The call ID is not a valid UUID.',
    type: ApiErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Call or recording not found or playback not authorized.',
    type: ApiErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'Recording is not ready for playback.',
    type: ApiErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'An unexpected server error occurred.',
    type: ApiErrorResponseDto,
  })
  getRecordingPlayback(
    @Param('callId', new ParseUUIDPipe()) callId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.uploadsService.getRecordingPlayback(callId, request.user.id);
  }

  @Post(':callId/recording-upload')
  @ApiOperation({
    summary: 'Create an authorized call recording upload URL',
  })
  @ApiCreatedResponse({
    description: 'A temporary signed upload URL was created.',
    type: RecordingUploadUrlResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'The call ID is not a valid UUID.',
    type: ApiErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Call not found or recording is not authorized.',
    type: ApiErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'An upload is already completed.',
    type: ApiErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'An unexpected server error occurred.',
    type: ApiErrorResponseDto,
  })
  createUpload(
    @Param('callId', new ParseUUIDPipe()) callId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.uploadsService.createUpload(callId, request.user.id);
  }

  @Post('recording-uploads/:uploadId/refresh')
  @ApiOperation({
    summary: 'Refresh an existing authorized call recording upload URL',
  })
  @ApiCreatedResponse({
    description: 'A refreshed temporary signed upload URL.',
    type: RecordingUploadUrlResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'The upload ID is not a valid UUID.',
    type: ApiErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Upload not found or not authorized.',
    type: ApiErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'Upload is no longer pending.',
    type: ApiErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'An unexpected server error occurred.',
    type: ApiErrorResponseDto,
  })
  refreshUpload(
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.uploadsService.refreshUpload(uploadId, request.user.id);
  }

  @Post('recording-uploads/:uploadId/complete')
  @ApiOperation({
    summary: 'Verify and complete a call recording upload',
  })
  @ApiCreatedResponse({
    description: 'The uploaded recording track was verified and completed.',
    type: CompleteRecordingUploadResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'The upload ID, recording metadata, or uploaded object is invalid.',
    type: ApiErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Upload not found or not authorized.',
    type: ApiErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'Upload is no longer pending or another completion request claimed it before this request.',
    type: ApiErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'An unexpected server error occurred.',
    type: ApiErrorResponseDto,
  })
  completeUpload(
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
    @Body() input: CompleteRecordingUploadDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.uploadsService.completeUpload(uploadId, request.user.id, input);
  }
}
