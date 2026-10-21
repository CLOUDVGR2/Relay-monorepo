"""Application entry point for the Relay AI service."""


from app.agentops.routes import router as incidents_router
from app.rag.routes import router as documents_router
import os
import math
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import FastAPI, Request, Security
from app.core.security import require_internal_token
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routes import router



app = FastAPI(
    title="Atlas AI",
    version="0.2.0",
    description="AI platform foundation for the chat application.",
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "CLIENT_URL",
        "http://localhost:5173,http://localhost:5174",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

app.include_router(incidents_router)

app.include_router(documents_router)

# Process-local metrics: bounded samples and low-cardinality route labels.
MAX_LATENCY_SAMPLES = 2048
_metrics_lock = Lock()
_request_counts = defaultdict(int)
_failure_counts = defaultdict(int)
_client_error_counts = defaultdict(int)
_server_error_counts = defaultdict(int)
_latency_samples = defaultdict(lambda: deque(maxlen=MAX_LATENCY_SAMPLES))


def _record_request(key, status_code, duration_ms):
    with _metrics_lock:
        _request_counts[key] += 1
        if status_code >= 400:
            _failure_counts[key] += 1
        if 400 <= status_code < 500:
            _client_error_counts[key] += 1
        if status_code >= 500:
            _server_error_counts[key] += 1
        _latency_samples[key].append(duration_ms)


class HTTPMetricsMiddleware:
    """Measure HTTP requests without relying on BaseHTTPMiddleware."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        started = time.perf_counter()
        status_code = 500

        async def send_wrapper(message):
            nonlocal status_code
            if message.get("type") == "http.response.start":
                status_code = message.get("status", 500)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            route = scope.get("route")
            route_template = getattr(route, "path", None)

            # Avoid scanning every registered route on the request hot path.
            # Router metadata is used when available; otherwise the bounded
            # "unmatched" label intentionally trades detail for predictable cost.
            key = (scope.get("method", "UNKNOWN"), route_template or "unmatched")
            duration_ms = (time.perf_counter() - started) * 1000
            _record_request(key, status_code, duration_ms)


app.add_middleware(HTTPMetricsMiddleware)


@app.get(
    "/internal/metrics",
    tags=["observability"],
    dependencies=[Security(require_internal_token)],
)
def internal_metrics():
    """Return aggregated process-local metrics to authenticated callers."""
    with _metrics_lock:
        snapshot = [
            (
                method,
                route,
                _request_counts[(method, route)],
                _failure_counts[(method, route)],
                _client_error_counts[(method, route)],
                _server_error_counts[(method, route)],
                list(_latency_samples[(method, route)]),
            )
            for method, route in _request_counts
        ]

    metrics = []
    for (
        method, route, count, failures, client_errors, server_errors, samples
    ) in snapshot:
        ordered = sorted(samples)
        p95_ms = (
            round(ordered[max(0, math.ceil(len(ordered) * 0.95) - 1)], 2)
            if ordered else None
        )
        metrics.append({
            "method": method,
            "route": route,
            "request_count": count,
            "failure_count": failures,
            "client_error_count": client_errors,
            "server_error_count": server_errors,
            "failure_rate": round(failures / count, 4) if count else 0,
            "p95_latency_ms": p95_ms,
            "latency_sample_count": len(samples),
        })

    return {
        "scope": "process_local",
        "metrics": sorted(
            metrics, key=lambda item: (item["route"], item["method"])
        ),
    }
