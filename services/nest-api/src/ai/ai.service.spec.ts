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

// Conversation analysis treats the Python service response as untrusted data.
describe('AIService conversation analysis', () => {
  const config = {
    PYTHON_AI_BASE_URL: 'http://127.0.0.1:8000',
    PYTHON_AI_INTERNAL_TOKEN: 'test-internal-token',
  };

  function createService() {
    const configService = {
      get: (key: string) => config[key as keyof typeof config],
    } as unknown as ConfigService;

    return new AIService(configService);
  }

  const messages = [
    { sender: 'Alex', text: 'We agreed to ship the fix Friday.' },
  ];

  it('sends bounded messages to Python with the internal token', async () => {
    const payload = {
      summary: 'The team agreed to ship the fix Friday.',
      decisions: ['Ship Friday'],
      action_items: [
        { task: 'Prepare the release', owner: 'Alex', due_date: 'Friday' },
      ],
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(createService().analyzeConversation(messages)).resolves.toEqual(
      payload,
    );

    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      'http://127.0.0.1:8000/v1/conversations/analyze',
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer test-internal-token',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ messages });
  });

  it('rejects oversized transcripts before calling Python', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const oversized = [
      { sender: 'Alex', text: 'x'.repeat(5000) },
      ...Array.from({ length: 10 }, () => ({
        sender: 'Alex',
        text: 'x'.repeat(5000),
      })),
    ];

    await expect(
      createService().analyzeConversation(oversized),
    ).rejects.toBeInstanceOf(BadGatewayException);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed analysis responses without exposing response data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            summary: 'Looks fine',
            decisions: [],
            action_items: [],
            secret: 'internal-detail',
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      createService().analyzeConversation(messages),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('sanitizes unsuccessful Python responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('sensitive model output', { status: 502 }),
      ),
    );

    await expect(
      createService().analyzeConversation(messages),
    ).rejects.toThrow('AI service could not analyze this conversation.');
  });
});
