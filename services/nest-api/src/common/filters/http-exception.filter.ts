/** Http exception filter module for the Relay NestJS API. */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Defines the stable JSON error contract exposed by the API.
 *
 * A string array supports request-validation failures where multiple
 * fields can be invalid in the same request.
 */
interface ApiErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  requestId: string;
  message: string | string[];
  error: string;
}

/**
 * Safely narrows an unknown value to a record of unknown properties.
 *
 * Exception responses are not assumed to have a particular shape until
 * their individual properties have been checked.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Normalizes exceptions into a consistent HTTP response.
 *
 * Security guarantees:
 * - Known HTTP exceptions retain their HTTP status.
 * - Unexpected exceptions return a generic HTTP 500 response.
 * - Internal exception details are logged, not returned to clients.
 * - Response properties are type-checked before being exposed.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  /** Identifies this filter in NestJS application logs. */
  private readonly logger = new Logger(HttpExceptionFilter.name);

  /**
   * Converts an exception into the public API error format.
   *
   * @param exception The exception raised during request processing.
   * @param host Provides access to the active HTTP request and response.
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    // Let Apollo handle GraphQL errors instead of formatting them as HTTP responses.
    if (typeof host.getType === 'function' && host.getType<string>() === 'graphql') {
      throw exception;
    }

    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request & { requestId?: string }>();

    // Preserve recognized HTTP status codes; unexpected exceptions
    // are treated as internal server errors.
    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    // Start with a safe response. Internal implementation details
    // must never be exposed by the fallback error message.
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (isHttpException) {
      const exceptionResponse: unknown = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        // Some NestJS exceptions use a plain string response.
        message = exceptionResponse;
      } else if (isRecord(exceptionResponse)) {
        // Treat every property as unknown until its type is verified.
        const responseMessage = exceptionResponse['message'];
        const responseError = exceptionResponse['error'];

        // ValidationPipe can supply an array of validation messages.
        if (
          typeof responseMessage === 'string' ||
          (Array.isArray(responseMessage) &&
            responseMessage.every(
              (item: unknown) => typeof item === 'string',
            ))
        ) {
          message = responseMessage;
        } else {
          // Retain a useful public message when no supported message
          // property exists in the structured exception response.
          message = exception.message;
        }

        // Only expose the error label when it is a string.
        if (typeof responseError === 'string') {
          error = responseError;
        } else {
          error = exception.name;
        }
      } else {
        // Defensive fallback for an unexpected response shape.
        message = exception.message;
        error = exception.name;
      }
    } else {
      // Log unexpected failures for server-side investigation.
      // Do not serialize the exception or stack trace into the response.
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // Keep the response contract consistent for frontend consumers.
    const body: ApiErrorResponse = {
      statusCode,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: request.requestId ?? 'unavailable',
      message,
      error,
    };

    response.status(statusCode).json(body);
  }
}
