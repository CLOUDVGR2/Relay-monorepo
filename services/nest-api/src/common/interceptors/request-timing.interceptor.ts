/** Request timing interceptor module for the Relay NestJS API. */

import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { finalize, type Observable } from 'rxjs';

interface RequestWithId extends Request {
  requestId?: string;
}

@Injectable()
export class RequestTimingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestTimingInterceptor.name);

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    if (context.getType<string>() !== 'http') {
      return next.handle();
    }

    const request =
      context.switchToHttp().getRequest<RequestWithId>();
    const startedAt = Date.now();

    return next.handle().pipe(
      finalize(() => {
        this.logger.log(
          JSON.stringify({
            event: 'http_handler_completed',
            requestId: request.requestId ?? 'unavailable',
            handler: context.getHandler().name,
            controller: context.getClass().name,
            durationMs: Date.now() - startedAt,
          }),
        );
      }),
    );
  }
}
