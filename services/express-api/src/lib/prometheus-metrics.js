import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry });

const labels = ["method", "route", "status_code"];

const requests = new Counter({
  name: "relay_http_requests_total",
  help: "Total HTTP requests handled by the Relay Express API.",
  labelNames: labels,
  registers: [metricsRegistry],
});

const duration = new Histogram({
  name: "relay_http_request_duration_seconds",
  help: "HTTP request duration in seconds for the Relay Express API.",
  labelNames: labels,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export function prometheusMetricsMiddleware(req, res, next) {
  if (req.path === "/metrics") {
    return next();
  }

  const startedAt = process.hrtime.bigint();

  res.once("finish", () => {
    const routePath =
      typeof req.route?.path === "string" ? req.route.path : "unmatched";

    const route = `${req.baseUrl || ""}${routePath}` || "/";
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
