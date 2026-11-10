/** Main module for the Relay NestJS API. */

import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
import { setupSwagger } from './openapi/setup-swagger.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware.js';
import { RequestTimingInterceptor } from './common/interceptors/request-timing.interceptor.js';
import { prometheusMetricsMiddleware } from './observability/prometheus-metrics.js';

/**
 * Initializes and starts the NestJS application.
 *
 * Security middleware and shared application configuration are installed
 * before the HTTP server begins accepting requests.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Expose Prometheus metrics and record HTTP request counts and latency.
  app.use(prometheusMetricsMiddleware);

  // Allow the configured frontend origin to send authentication cookies.
  const configService = app.get(ConfigService);
  const clientUrl =
    configService.get<string>('CLIENT_URL') ?? 'http://localhost:5173';

  app.enableCors({
    origin: clientUrl.split(',').map((origin) => origin.trim()),
    credentials: true,
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "upgrade-insecure-requests": null,
          'script-src': ["'self'", 'https://unpkg.com', "'unsafe-inline'"],
          'style-src': ["'self'", 'https:', "'unsafe-inline'"],
          'font-src': ["'self'", 'https:', 'data:'],
          'img-src': ["'self'", 'data:'],
        },
      },
    }),
  );

  // Parse the Express-issued JWT cookie before GraphQL guards execute.
  app.use(cookieParser());

  const requestContextMiddleware = new RequestContextMiddleware();
  app.use(requestContextMiddleware.use.bind(requestContextMiddleware));
  app.useGlobalInterceptors(new RequestTimingInterceptor());

  app.useGlobalFilters(new HttpExceptionFilter());
  configureApp(app);

  setupSwagger(app);

  const port = configService.get<number>('PORT', 3000);

  console.log('[DEBUG] About to listen:', port, typeof port);

  try {
    await app.listen(port);
    console.log('[DEBUG] app.listen() resolved');
    console.log('[DEBUG] URL:', await app.getUrl());
  } catch (error) {
    console.error('[DEBUG] app.listen() failed:', error);
    throw error;
  }
}

await bootstrap();
