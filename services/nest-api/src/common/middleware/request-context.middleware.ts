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
