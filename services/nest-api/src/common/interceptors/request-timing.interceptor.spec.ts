/** Tests for request timing interceptor spec in the nest api. */

import {
  Logger,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { RequestTimingInterceptor } from './request-timing.interceptor.js';

describe('RequestTimingInterceptor', () => {
  let interceptor: RequestTimingInterceptor;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    interceptor = new RequestTimingInterceptor();
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function createContext(type: string): ExecutionContext {
    function sampleHandler() {}

    class SampleController {}

    return {
      getType: () => type,
      switchToHttp: () => ({
        getRequest: () => ({
          requestId: 'trace-123',
        }),
      }),
      getHandler: () => sampleHandler,
      getClass: () => SampleController,
    } as unknown as ExecutionContext;
  }

  it('logs HTTP handler timing and preserves the handler result', async () => {
    const context = createContext('http');
    const handler: CallHandler = {
      handle: () => of('success'),
    };

    await expect(
      lastValueFrom(interceptor.intercept(context, handler)),
    ).resolves.toBe('success');

    expect(logSpy).toHaveBeenCalledOnce();

    const loggedEvent = JSON.parse(String(logSpy.mock.calls[0]?.[0]));

    expect(loggedEvent).toEqual(
      expect.objectContaining({
        event: 'http_handler_completed',
        requestId: 'trace-123',
        handler: 'sampleHandler',
        controller: 'SampleController',
        durationMs: expect.any(Number),
      }),
    );
  });

  it('does not apply HTTP timing logs to non-HTTP contexts', async () => {
    const context = createContext('graphql');
    const handler: CallHandler = {
      handle: () => of('graphql-result'),
    };

    await expect(
      lastValueFrom(interceptor.intercept(context, handler)),
    ).resolves.toBe('graphql-result');

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('uses a safe fallback when the request ID is missing', async () => {
    const context = {
      ...createContext('http'),
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    } as unknown as ExecutionContext;

    const handler: CallHandler = {
      handle: () => of('success'),
    };

    await lastValueFrom(interceptor.intercept(context, handler));

    const loggedEvent = JSON.parse(String(logSpy.mock.calls[0]?.[0]));

    expect(loggedEvent.requestId).toBe('unavailable');
  });
});
