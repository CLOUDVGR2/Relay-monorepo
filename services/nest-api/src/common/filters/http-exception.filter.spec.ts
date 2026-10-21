/** Tests for http exception filter spec in the nest api. */

import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';

/**
 * Tests the exception filter without starting an HTTP server.
 *
 * These unit tests verify that the filter returns consistent and safe
 * error responses, helping prevent regressions as the application grows.
 */
describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  // Mock the Express response methods used by the exception filter.
  // mockReturnThis() allows method chaining, similar to Express responses.
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };

  // Provide the minimum request properties required by the filter.
  // A fixed URL makes it easy to verify the path in error responses.
  const request = {
    method: 'GET',
    url: '/test-resource',
    requestId: 'trace-test-123',
  };

  /**
   * Creates a minimal HTTP execution context for unit testing.
   *
   * This mock provides the request and response objects expected by
   * NestJS without starting an application or making network requests.
   */
  const createHost = (): ArgumentsHost =>
    ({
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    }) as unknown as ArgumentsHost;

  beforeEach(() => {
    // Create a fresh filter instance before each test.
    filter = new HttpExceptionFilter();

    // Clear recorded mock calls so each test runs independently.
    vi.clearAllMocks();
  });

  it('should preserve the status and message of a known HTTP exception', () => {
    // Simulate a resource-not-found error raised by the application.
    filter.catch(
      new NotFoundException('Chat not found'),
      createHost(),
    );

    // Verify that the filter returns HTTP 404 Not Found.
    expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);

    // Verify that the response contains the expected error details.
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        path: '/test-resource',
        requestId: 'trace-test-123',
        message: 'Chat not found',
        error: 'Not Found',
      }),
    );
  });

  it('should preserve multiple validation messages', () => {
    // Simulate a validation error containing multiple messages.
    const exception = new BadRequestException({
      message: ['email must be valid', 'password is too short'],
      error: 'Bad Request',
    });

    // Pass the validation exception through the filter.
    filter.catch(exception, createHost());

    // Verify that validation failures return HTTP 400 Bad Request.
    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.BAD_REQUEST,
    );

    // Ensure that every validation message is preserved for the client.
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: ['email must be valid', 'password is too short'],
        error: 'Bad Request',
      }),
    );
  });

  it('should hide unexpected exception details from clients', () => {
    // Simulate an unexpected internal error containing sensitive information.
    const exception = new Error(
      'Sensitive database connection information',
    );

    // Handle the unexpected error using the global exception filter.
    filter.catch(exception, createHost());

    // Unexpected errors should return HTTP 500 Internal Server Error.
    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );

    // Verify that the client receives a safe, standardized error response.
    // Internal implementation details must not be exposed.
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        timestamp: expect.any(String),
        path: '/test-resource',
        requestId: 'trace-test-123',
        message: 'Internal server error',
        error: 'Internal Server Error',
      }),
    );

    // Inspect the complete response body to ensure the original
    // sensitive exception message is not exposed to the client.
    const responseBody = response.json.mock.calls[0]?.[0];

    expect(JSON.stringify(responseBody)).not.toContain(
      exception.message,
    );

    // The filter may log the internal exception on the server for debugging.
    // The sensitive details must remain absent from the client response.
  });
});