/** Runtime configuration for the Relay NestJS API. */

import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';

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
        const messages = errors.flatMap((error) =>
          Object.values(error.constraints ?? {}),
        );

        return new BadRequestException(
          messages.join('; ') || 'Invalid input',
        );
      },
    }),
  );
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Fullstack Chat API')
    .setDescription(
      'API documentation for the Fullstack Chat application.',
    )
    .setVersion('1.0.0')
    .addCookieAuth('jwt', { type: 'apiKey', in: 'cookie' }, 'jwt')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/openapi.json',
    swaggerOptions: {
      persistAuthorization: false,
    },
  });
}
