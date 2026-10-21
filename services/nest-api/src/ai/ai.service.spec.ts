/** Tests for ai service spec in the nest api. */

import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIService } from './ai.service.js';

describe('AIService', () => {
  const config = {
    PYTHON_AI_BASE_URL: 'http://127.0.0.1:8000',
    PYTHON_AI_INTERNAL_TOKEN: 'test-internal-token',
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createService(values: Record<string, string | undefined> = config) {
    const configService = {
      get: (key: string) => values[key],
    } as unknown as ConfigService;

    return new AIService(configService);
  }

  it('authenticates with Python AI and returns its status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          service: 'atlas-ai',
          provider: 'mock',
          configured: false,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createService().getStatus();

    expect(result).toEqual({
      service: 'atlas-ai',
      provider: 'mock',
      configured: false,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      'http://127.0.0.1:8000/v1/ai/status',
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer test-internal-token',
    );
  });

  it('fails when AI integration is not configured', async () => {
    await expect(
      createService({}).getStatus(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('handles an unreachable Python AI service', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection refused')),
    );

    await expect(
      createService().getStatus(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('does not expose Python AI error details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('sensitive internal error', { status: 401 }),
      ),
    );

    await expect(
      createService().getStatus(),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('rejects malformed status responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ service: 'atlas-ai' }), {
          status: 200,
        }),
      ),
    );

    await expect(
      createService().getStatus(),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
