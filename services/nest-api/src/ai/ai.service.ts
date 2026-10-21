/** Service-layer logic for ai service in the Relay NestJS API. */

import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AIStatusResponse {
  service: string;
  provider: string;
  configured: boolean;
}

@Injectable()
export class AIService {
  constructor(private readonly configService: ConfigService) {}

  async getStatus(): Promise<AIStatusResponse> {
    const baseUrl = this.configService
      .get<string>('PYTHON_AI_BASE_URL')
      ?.trim();

    const token = this.configService
      .get<string>('PYTHON_AI_INTERNAL_TOKEN')
      ?.trim();

    if (!baseUrl || !token) {
      throw new ServiceUnavailableException(
        'AI service integration is not configured.',
      );
    }

    let response: Response;

    try {
      response = await fetch(
        new URL('/v1/ai/status', baseUrl),
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(5000),
        },
      );
    } catch {
      throw new ServiceUnavailableException(
        'AI service is unavailable.',
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(
        'AI service returned an unsuccessful response.',
      );
    }

    let data: unknown;

    try {
      data = await response.json();
    } catch {
      throw new BadGatewayException(
        'AI service returned an invalid response.',
      );
    }

    if (
      typeof data !== 'object' ||
      data === null ||
      !('service' in data) ||
      typeof data.service !== 'string' ||
      !('provider' in data) ||
      typeof data.provider !== 'string' ||
      !('configured' in data) ||
      typeof data.configured !== 'boolean'
    ) {
      throw new BadGatewayException(
        'AI service returned an invalid response.',
      );
    }

    return {
      service: data.service,
      provider: data.provider,
      configured: data.configured,
    };
  }
}
