package main

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type jobsMetrics struct {
	registry *prometheus.Registry
	requests *prometheus.CounterVec
	duration *prometheus.HistogramVec
}

type jobsRuntime struct {
	handler        http.Handler
	metricsHandler http.Handler
}

func newJobsMetrics() *jobsMetrics {
	registry := prometheus.NewRegistry()

	requests := prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "relay_http_requests_total",
			Help: "Total HTTP requests handled by the Jobs API.",
		},
		[]string{"method", "route", "status_code"},
	)

	duration := prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "relay_http_request_duration_seconds",
			Help:    "HTTP request duration in seconds for the Jobs API.",
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

	return &jobsMetrics{
		registry: registry,
		requests: requests,
		duration: duration,
	}
}

func (m *jobsMetrics) handler() http.Handler {
	return promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{})
}

func (m *jobsMetrics) middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		route := c.FullPath()
		if route == "" {
			route = "unmatched"
		}

		m.requests.WithLabelValues(
			jobsMetricMethod(c.Request.Method),
			route,
			strconv.Itoa(c.Writer.Status()),
		).Inc()

		m.duration.WithLabelValues(
			jobsMetricMethod(c.Request.Method),
			route,
		).Observe(time.Since(start).Seconds())
	}
}

func jobsMetricMethod(method string) string {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodPost,
		http.MethodPut, http.MethodPatch, http.MethodDelete,
		http.MethodOptions, http.MethodConnect, http.MethodTrace:
		return method
	default:
		return "OTHER"
	}
}
