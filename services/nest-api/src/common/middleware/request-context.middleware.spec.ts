/** Tests for request context middleware spec in the nest api. */

import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextMiddleware } from './request-context.middleware.js';

describe('RequestContextMiddleware', () => {
  let middleware: RequestContextMiddleware;
  let finishListener: (() => void) | undefined;
  let request: Request & { requestId?: string };
  let response: {
    statusCode: number;
    setHeader: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };
  let next: NextFunction;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    middleware = new RequestContextMiddleware();
    finishListener = undefined;

    request = {
      headers: {},
      method: 'GET',
      path: '/health',
    } as unknown as Request & { requestId?: string };

    response = {
      statusCode: 200,
      setHeader: vi.fn(),
      on: vi.fn((event: string, listener: () => void) => {
        if (event === 'finish') finishListener = listener;
        return response;
      }),
    };

    next = vi.fn();
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('generates a request ID and forwards it in the response header', () => {
    middleware.use(request, response as unknown as Response, next);

    expect(request.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/i,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Request-Id',
      request.requestId,
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('preserves a valid incoming request ID', () => {
    request.headers['x-request-id'] = 'trace-123:api';

    middleware.use(request, response as unknown as Response, next);

    expect(request.requestId).toBe('trace-123:api');
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Request-Id',
      'trace-123:api',
    );
  });

  it('replaces malformed incoming request IDs', () => {
    request.headers['x-request-id'] = 'invalid request id';

    middleware.use(request, response as unknown as Response, next);

    expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(request.requestId).not.toBe('invalid request id');
  });

  it('logs request completion when the response finishes', () => {
    middleware.use(request, response as unknown as Response, next);

    expect(finishListener).toBeTypeOf('function');
    finishListener?.();

    const loggedEvent = JSON.parse(String(logSpy.mock.calls[0]?.[0]));

    expect(loggedEvent).toEqual(
      expect.objectContaining({
        event: 'http_request_completed',
        requestId: request.requestId,
        method: 'GET',
        path: '/health',
        statusCode: 200,
        durationMs: expect.any(Number),
      }),
    );
  });
});
