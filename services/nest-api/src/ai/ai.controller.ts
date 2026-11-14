/** Authenticated AI endpoints for the Relay NestJS API. */

import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { HttpAuthGuard } from '../auth/http-auth.guard.js';
import { ApiErrorResponseDto } from '../common/dto/api-error-response.dto.js';
import { AnswerQuestionDto } from './dto/answer-question.dto.js';
import { AIService, type KnowledgeBaseAnswerResponse } from './ai.service.js';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@ApiTags('AI')
@ApiCookieAuth('jwt')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({
  description: 'Authentication required.',
  type: ApiErrorResponseDto,
})
@Controller('ai')
@UseGuards(HttpAuthGuard)
export class AIController {
  constructor(private readonly aiService: AIService) {}

  @Post('answer')
  @ApiOperation({
    summary: 'Answer a question using the authenticated user knowledge base',
  })
  @ApiOkResponse({
    description: 'The knowledge-base answer and supporting citations.',
  })
  @ApiBadRequestResponse({
    description: 'The question or retrieval limit is invalid.',
    type: ApiErrorResponseDto,
  })
  @ApiBadGatewayResponse({
    description: 'The AI service returned an invalid response.',
    type: ApiErrorResponseDto,
  })
  answer(
    @Body() input: AnswerQuestionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<KnowledgeBaseAnswerResponse> {
    return this.aiService.answerQuestion(
      input.question,
      input.top_k,
      request.user.id,
    );
  }
}
