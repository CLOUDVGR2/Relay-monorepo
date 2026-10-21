/** Api error response dto module for the Relay NestJS API. */

import { ApiProperty } from '@nestjs/swagger';

/**
 * Documents the stable JSON structure returned when an API request fails.
 *
 * Keeping this schema reusable ensures that every controller describes
 * errors consistently for frontend developers and generated API clients.
 */
export class ApiErrorResponseDto {
  /** HTTP status code associated with the failed request. */
  @ApiProperty({
    description: 'HTTP status code returned by the API.',
    example: 404,
  })
  statusCode!: number;

  /** UTC timestamp indicating when the error response was generated. */
  @ApiProperty({
    description: 'ISO 8601 timestamp in UTC.',
    example: '2026-10-12T21:19:34.000Z',
  })
  timestamp!: string;

  /** Request path associated with the error. */
  @ApiProperty({
    description: 'Request path that produced the error.',
    example: '/health',
  })
  path!: string;

  /** Correlation identifier shared by the response and server logs. */
  @ApiProperty({
    description: 'Request correlation ID for troubleshooting.',
    example: 'a1b2c3d4-1234-4567-8901-abcdef123456',
  })
  requestId!: string;

  /**
   * Public error message. Validation failures may contain multiple messages,
   * one for each invalid field or constraint.
   */
  @ApiProperty({
    description:
      'Human-readable error message, or an array of validation messages.',
    oneOf: [
      {
        type: 'string',
        example: 'Resource not found',
      },
      {
        type: 'array',
        items: {
          type: 'string',
        },
        example: [
          'email must be an email',
          'password must be longer than or equal to 8 characters',
        ],
      },
    ],
  })
  message!: string | string[];

  /** Short HTTP error category, such as Not Found or Bad Request. */
  @ApiProperty({
    description: 'Short HTTP error category.',
    example: 'Not Found',
  })
  error!: string;
}
