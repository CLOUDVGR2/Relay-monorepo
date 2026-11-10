/**
 * Internal authorization for one-to-one WebRTC signaling sessions.
 * This endpoint is for trusted server-to-server calls only.
 */
import {
  Body,
  Controller,
  Headers,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { IsString, IsUUID, Matches } from 'class-validator';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiProperty,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/dto/api-error-response.dto.js';
import { AuthorizeMediaSessionResponseDto } from './dto/call-recording-response.dto.js';
import { CallsService } from './calls.service.js';

class AuthorizeMediaSessionDto {
  @ApiProperty({
    description: 'UUID of the active call session.',
    format: 'uuid',
    example: '8dd36e71-3c3e-44b8-8469-617c27990d78',
  })
  @IsUUID()
  callId!: string;

  @ApiProperty({
    description: '24-character hexadecimal identifier of the requesting participant.',
    example: '507f1f77bcf86cd799439011',
    pattern: '^[a-fA-F0-9]{24}$',
  })
  @IsString()
  @Matches(/^[a-fA-F0-9]{24}$/)
  actorId!: string;
}

@ApiTags('Internal media sessions')
@ApiBearerAuth('internalBearer')
@Controller('internal/media-sessions')
export class InternalMediaSessionsController {
  constructor(
    private readonly config: ConfigService,
    private readonly callsService: CallsService,
  ) {}

  @Post('authorize')
  @ApiOperation({
    summary: 'Authorize an active internal media session',
    description:
      'Trusted server-to-server endpoint. Requires the internal bearer token; never call directly from browser or mobile clients.',
  })
  @ApiCreatedResponse({
    description: 'The peer identity and recording-consent authorization.',
    type: AuthorizeMediaSessionResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'The call ID or participant ID is invalid.',
    type: ApiErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'The internal bearer token is missing or invalid.',
    type: ApiErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'No eligible active media session was found.',
    type: ApiErrorResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'Internal authorization is not configured.',
    type: ApiErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'An unexpected server error occurred.',
    type: ApiErrorResponseDto,
  })
  async authorize(
    @Headers('authorization') authorization: string | undefined,
    @Body() input: AuthorizeMediaSessionDto,
  ) {
    const expectedToken = this.config.get<string>('CALL_EVENTS_INTERNAL_TOKEN');

    if (!expectedToken?.trim()) {
      throw new ServiceUnavailableException('Internal authorization unavailable');
    }

    const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? '');
    if (!match) {
      throw new UnauthorizedException('Invalid internal credentials');
    }

    const supplied = Buffer.from(match[1], 'utf8');
    const expected = Buffer.from(expectedToken, 'utf8');

    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      throw new UnauthorizedException('Invalid internal credentials');
    }

    return this.callsService.authorizeMediaSession(input.callId, input.actorId);
  }
}
