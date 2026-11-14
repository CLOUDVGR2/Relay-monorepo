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
    await expect(createService({}).getStatus()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('handles an unreachable Python AI service', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection refused')),
    );

    await expect(createService().getStatus()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('does not expose Python AI error details', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('sensitive internal error', { status: 401 }),
        ),
    );

    await expect(createService().getStatus()).rejects.toBeInstanceOf(
      BadGatewayException,
    );
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

    await expect(createService().getStatus()).rejects.toBeInstanceOf(
      BadGatewayException,
    );
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

    await expect(
      createService().analyzeConversation(messages),
    ).resolves.toEqual(payload);

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
      vi
        .fn()
        .mockResolvedValue(
          new Response('sensitive model output', { status: 502 }),
        ),
    );

    await expect(createService().analyzeConversation(messages)).rejects.toThrow(
      'AI service could not analyze this conversation.',
    );
  });
});

// Tenant-scoped Knowledge Base retrieval.
describe('AIService knowledge-base answers', () => {
  const config = {
    PYTHON_AI_BASE_URL: 'http://127.0.0.1:8000',
    PYTHON_AI_INTERNAL_TOKEN: 'test-internal-token',
  };

  const userId = '507f1f77bcf86cd799439011';

  const citation = {
    chunk_id: '11111111-1111-4111-8111-111111111111',
    document_id: '22222222-2222-4222-8222-222222222222',
    title: 'Cedar Grove Workshop Guide',
    content: 'The workshop closes at 7 PM on Thursdays.',
    source_uri: 'https://example.test/workshop-guide',
    chunk_index: 0,
    start: 0,
    end: 43,
  };

  const answerPayload = {
    answer: 'The workshop closes at 7 PM on Thursdays.',
    citations: [citation],
  };

  function createService(values: Record<string, string | undefined> = config) {
    const configService = {
      get: (key: string) => values[key],
    } as unknown as ConfigService;

    return new AIService(configService);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the question and authenticated tenant ID to the Python RAG endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(answerPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createService().answerQuestion(
      '  When does the workshop close on Thursday?  ',
      5,
      userId,
    );

    expect(result).toEqual(answerPayload);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, options] = fetchMock.mock.calls[0];

    expect(url.toString()).toBe('http://127.0.0.1:8000/v1/documents/answer');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer test-internal-token');
    expect(options.headers['X-Relay-User-Id']).toBe(userId);
    expect(JSON.parse(options.body)).toEqual({
      question: 'When does the workshop close on Thursday?',
      top_k: 5,
    });
  });

  it('returns normalized answers and citations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            answer: '  The workshop closes at 7 PM.  ',
            citations: [citation],
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      createService().answerQuestion('Closing time?', 3, userId),
    ).resolves.toEqual({
      answer: 'The workshop closes at 7 PM.',
      citations: [citation],
    });
  });

  it('rejects invalid questions and tenant IDs before calling Python', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const service = createService();

    await expect(
      service.answerQuestion('   ', 5, userId),
    ).rejects.toBeInstanceOf(BadGatewayException);

    await expect(
      service.answerQuestion('Question?', 0, userId),
    ).rejects.toBeInstanceOf(BadGatewayException);

    await expect(
      service.answerQuestion('Question?', 5, '  '),
    ).rejects.toBeInstanceOf(BadGatewayException);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed citations without exposing Python response data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            answer: 'The workshop closes at 7 PM.',
            citations: [{ ...citation, chunk_index: 'invalid' }],
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      createService().answerQuestion('Closing time?', 5, userId),
    ).rejects.toThrow(
      'Knowledge-base AI service returned an invalid response.',
    );
  });

  it('sanitizes unsuccessful Python responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('sensitive internal model output', { status: 502 }),
        ),
    );

    await expect(
      createService().answerQuestion('Closing time?', 5, userId),
    ).rejects.toThrow(
      'Knowledge-base AI service could not answer this question.',
    );
  });

  it('handles an unreachable Python RAG service', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection refused')),
    );

    await expect(
      createService().answerQuestion('Closing time?', 5, userId),
    ).rejects.toThrow('Knowledge-base AI service is unavailable.');
  });
});
