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
import { CallsService } from './calls.service.js';

class AuthorizeMediaSessionDto {
  @IsUUID()
  callId!: string;

  @IsString()
  @Matches(/^[a-fA-F0-9]{24}$/)
  actorId!: string;
}

@Controller('internal/media-sessions')
export class InternalMediaSessionsController {
  constructor(
    private readonly config: ConfigService,
    private readonly callsService: CallsService,
  ) {}

  @Post('authorize')
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
