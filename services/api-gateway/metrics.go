package main

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type gatewayMetrics struct {
	registry *prometheus.Registry
	requests *prometheus.CounterVec
	duration *prometheus.HistogramVec
}

func newGatewayMetrics() *gatewayMetrics {
	registry := prometheus.NewRegistry()

	requests := prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "relay_http_requests_total",
			Help: "Total HTTP requests handled by the API gateway.",
		},
		[]string{"method", "route", "status_code"},
	)

	duration := prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "relay_http_request_duration_seconds",
			Help:    "HTTP request duration in seconds for the API gateway.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "route"},
	)

	registry.MustRegister(
		prometheus.NewGoCollector(),
		prometheus.NewProcessCollector(prometheus.ProcessCollectorOpts{}),
		requests,
		duration,
	)

	return &gatewayMetrics{
		registry: registry,
		requests: requests,
		duration: duration,
	}
}

func (m *gatewayMetrics) handler() http.Handler {
	return promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{})
}

func (m *gatewayMetrics) observe(method, route string, status int, elapsed time.Duration) {
	m.requests.WithLabelValues(method, route, strconv.Itoa(status)).Inc()
	m.duration.WithLabelValues(method, route).Observe(elapsed.Seconds())
}

func gatewayMetricMethod(method string) string {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodPost,
		http.MethodPut, http.MethodPatch, http.MethodDelete,
		http.MethodOptions, http.MethodConnect, http.MethodTrace:
		return method
	default:
		return "OTHER"
	}
}

func gatewayMetricRoute(path string) string {
	switch {
	case path == "/gateway/openapi.json":
		return "gateway_openapi"
	case path == "/gateway/docs":
		return "gateway_docs"
	case path == "/healthz":
		return "healthz"
	case path == "/readyz":
		return "readyz"
	case path == "/api" || strings.HasPrefix(path, "/api/"):
		return "api_proxy"
	case strings.HasPrefix(path, "/socket.io/"):
		return "socketio_proxy"
	case path == "/jobs" || strings.HasPrefix(path, "/jobs/"):
		return "jobs_proxy"
	case path == "/graphql" || strings.HasPrefix(path, "/graphql/"):
		return "graphql_proxy"
	case path == "/calls" || strings.HasPrefix(path, "/calls/"):
		return "calls_proxy"
	case path == "/docs" || strings.HasPrefix(path, "/docs/"):
		return "docs_proxy"
	case path == "/health" || strings.HasPrefix(path, "/health/"):
		return "health_proxy"
	default:
		return "unmatched"
	}
}
