import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';
import type { NextFunction, Request, Response } from 'express';

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry });

const labels = ['method', 'route', 'status_code'] as const;

const requests = new Counter({
  name: 'relay_http_requests_total',
  help: 'Total HTTP requests handled by the Relay NestJS API.',
  labelNames: [...labels],
  registers: [metricsRegistry],
});

const duration = new Histogram({
  name: 'relay_http_request_duration_seconds',
  help: 'HTTP request duration in seconds for the Relay NestJS API.',
  labelNames: [...labels],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export function prometheusMetricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.path === '/metrics') {
    void metricsRegistry
      .metrics()
      .then((body) => {
        res.setHeader('Content-Type', metricsRegistry.contentType);
        res.end(body);
      })
      .catch((error: unknown) => next(error));

    return;
  }

  const startedAt = process.hrtime.bigint();

  res.once('finish', () => {
    const routePath =
      typeof req.route?.path === 'string' ? req.route.path : 'unmatched';

    const route = `${req.baseUrl || ''}${routePath}` || '/';
    const metricLabels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };

    requests.inc(metricLabels);
    duration.observe(
      metricLabels,
      Number(process.hrtime.bigint() - startedAt) / 1e9,
    );
  });

  next();
}
