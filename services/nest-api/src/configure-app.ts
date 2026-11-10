/** Runtime configuration for the Relay NestJS API. */

import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';

/**
 * Applies shared HTTP application configuration.
 *
 * Keeping validation and API documentation setup here allows production
 * bootstrap and end-to-end tests to use the same application settings.
 */
export function configureApp(app: INestApplication): void {
  // Validate decorated DTOs consistently before controller or resolver logic
  // processes input. GraphQL runtime validation must still be verified by tests.
  app.useGlobalPipes(
    new ValidationPipe({
      // Convert plain request objects into DTO instances when supported.
      transform: true,

      // Strip properties that lack validation decorators.
      whitelist: true,

      // Reject unknown properties rather than silently accepting them.
      forbidNonWhitelisted: true,

      // Avoid implicit conversions that could conceal invalid client input.
      transformOptions: {
        enableImplicitConversion: false,
      },

      // Return actionable constraint messages without exposing internal details.
      exceptionFactory: (errors) => {
        const recordingErrors = errors.filter((error) =>
          ['sampleCount', 'byteSize', 'sha256'].includes(error.property),
        );

        if (recordingErrors.length > 0) {
          console.warn(
            '[Recording upload] Validation boundary diagnostic',
            JSON.stringify(
              recordingErrors.map((error) => ({
                property: error.property,
                valueType: typeof error.value,
                value:
                  error.property === 'sha256'
                    ? undefined
                    : error.value,
                sha256Length:
                  error.property === 'sha256' &&
                  typeof error.value === 'string'
                    ? error.value.length
                    : undefined,
                constraints: error.constraints,
              })),
            ),
          );
        }

        const messages = errors.flatMap((error) =>
          Object.values(error.constraints ?? {}),
        );

        return new BadRequestException(
          messages.join('; ') || 'Invalid input',
        );
      },
    }),
  );
}
