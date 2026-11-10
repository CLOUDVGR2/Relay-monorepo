/** Request middleware for request context middleware in the Relay NestJS API. */

import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

interface RequestWithId extends Request {
  requestId?: string;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestContextMiddleware.name);

  use(
    request: RequestWithId,
    response: Response,
    next: NextFunction,
  ): void {
    const suppliedId = request.headers['x-request-id'];
    const validId =
      typeof suppliedId === 'string' &&
      /^[A-Za-z0-9._:-]{1,128}$/.test(suppliedId);

    const requestId = validId ? suppliedId : randomUUID();

    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);

    if (
      request.method === 'POST' &&
      /^\/calls\/recording-uploads\/[^/]+\/complete$/.test(request.path)
    ) {
      const body = request.body as Record<string, unknown> | undefined;
      const isObject = typeof body === 'object' && body !== null;

      this.logger.log(
        JSON.stringify({
          event: 'recording_upload_request_body',
          requestId,
          isObject,
          keys: isObject ? Object.keys(body) : [],
          sampleCountType: typeof body?.sampleCount,
          byteSizeType: typeof body?.byteSize,
          sha256Type: typeof body?.sha256,
          sha256Length:
            typeof body?.sha256 === 'string' ? body.sha256.length : null,
        }),
      );
    }

    const startedAt = Date.now();

    response.on('finish', () => {
      this.logger.log(
        JSON.stringify({
          event: 'http_request_completed',
          requestId,
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
        }),
      );
    });

    next();
  }
}
