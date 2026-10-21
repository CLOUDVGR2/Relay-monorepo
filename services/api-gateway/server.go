// Package main contains HTTP server and routing for the Relay API gateway.

package main

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"
)

type responseRecorder struct {
	http.ResponseWriter
	status int
}

func (r *responseRecorder) WriteHeader(status int) {
	if r.status != 0 {
		return
	}
	enforceSecurityHeaders(r.ResponseWriter.Header())
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *responseRecorder) Write(p []byte) (int, error) {
	if r.status == 0 {
		r.WriteHeader(http.StatusOK)
	}
	return r.ResponseWriter.Write(p)
}

func (r *responseRecorder) Unwrap() http.ResponseWriter {
	return r.ResponseWriter
}

func (r *responseRecorder) Flush() {
	if r.status == 0 {
		r.WriteHeader(http.StatusOK)
	}
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Hijack keeps the underlying connection available for WebSocket upgrades.
func (r *responseRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	return http.NewResponseController(r.ResponseWriter).Hijack()
}

func newRequestID() string {
	var id [16]byte
	if _, err := rand.Read(id[:]); err != nil {
		// Request IDs are for diagnostics, never authentication.
		return time.Now().UTC().Format("20060102T150405.000000000")
	}
	return hex.EncodeToString(id[:])
}

func validRequestID(value string) bool {
	if len(value) < 1 || len(value) > 128 {
		return false
	}
	for _, r := range value {
		if !(r >= 'a' && r <= 'z') &&
			!(r >= 'A' && r <= 'Z') &&
			!(r >= '0' && r <= '9') &&
			!strings.ContainsRune("-_.:", r) {
			return false
		}
	}
	return true
}

func writeJSONError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error":   code,
		"message": message,
	})
}

// enforceSecurityHeaders keeps the gateway's public response policy consistent.
func enforceSecurityHeaders(h http.Header) {
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("X-Frame-Options", "DENY")
	h.Set("Referrer-Policy", "no-referrer")
}

func newReverseProxy(rawURL string, logger *slog.Logger) (http.Handler, *http.Transport) {
	target, err := url.Parse(rawURL)
	if err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			writeJSONError(w, http.StatusBadGateway, "upstream_unavailable", "Upstream is unavailable")
		}), nil
	}

	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           (&net.Dialer{Timeout: 3 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   20,
		MaxConnsPerHost:       100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   5 * time.Second,
		ResponseHeaderTimeout: 10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
	proxy := &httputil.ReverseProxy{Transport: transport}
	proxy.Rewrite = func(pr *httputil.ProxyRequest) {
		pr.SetURL(target)

		// Rebuild forwarding metadata from the connection, not client headers.
		pr.Out.Header.Del("X-Forwarded-For")
		pr.Out.Header.Del("X-Forwarded-Host")
		pr.Out.Header.Del("X-Forwarded-Proto")

		if clientIP, _, err := net.SplitHostPort(pr.In.RemoteAddr); err == nil {
			pr.Out.Header.Set("X-Forwarded-For", clientIP)
		}
		pr.Out.Header.Set("X-Forwarded-Host", pr.In.Host)
		if pr.In.TLS != nil {
			pr.Out.Header.Set("X-Forwarded-Proto", "https")
		} else {
			pr.Out.Header.Set("X-Forwarded-Proto", "http")
		}

		if id := pr.In.Header.Get("X-Request-ID"); validRequestID(id) {
			pr.Out.Header.Set("X-Request-ID", id)
		} else {
			pr.Out.Header.Del("X-Request-ID")
		}
	}

	// Enforce security headers before the upstream response is sent to the client.
	proxy.ModifyResponse = func(resp *http.Response) error {
		enforceSecurityHeaders(resp.Header)
		return nil
	}

	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		logger.Warn("upstream request failed",
			"request_id", r.Header.Get("X-Request-ID"),
			"upstream", target.Host,
			"error", err,
		)
		writeJSONError(w, http.StatusBadGateway, "upstream_unavailable", "The requested service is temporarily unavailable")
	}

	return proxy, transport
}

type gatewayRuntime struct {
	handler    http.Handler
	transports []*http.Transport
}

func newGatewayRuntime(logger *slog.Logger, cfg config) *gatewayRuntime {
	mux := http.NewServeMux()

	// Liveness only checks the gateway process; it does not depend on backends.
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("{\"status\":\"ok\"}\n"))
	})

	// Readiness is expanded to check required dependencies as they are added.
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("{\"status\":\"ready\"}\n"))
	})

	expressProxy, expressTransport := newReverseProxy(cfg.ExpressURL, logger)
	nestProxy, nestTransport := newReverseProxy(cfg.NestURL, logger)

	// Keep the initial public route allowlist narrow. Internal Go job endpoints
	// and Python internal APIs are deliberately not exposed by this first pass.
	mux.Handle("/api", expressProxy)
	mux.Handle("/api/", expressProxy)
	mux.Handle("/socket.io/", expressProxy)
	mux.Handle("/jobs", nestProxy)
	mux.Handle("/jobs/", nestProxy)
	mux.Handle("/graphql", nestProxy)
	mux.Handle("/docs", nestProxy)
	mux.Handle("/docs/", nestProxy)
	mux.Handle("/health", nestProxy)
	mux.Handle("/health/", nestProxy)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := r.Header.Get("X-Request-ID")
		if !validRequestID(requestID) {
			requestID = newRequestID()
		}

		// Replace the incoming value so all downstream logging sees one safe ID.
		r.Header.Set("X-Request-ID", requestID)
		w.Header().Set("X-Request-ID", requestID)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")

		recorder := &responseRecorder{ResponseWriter: w}
		start := time.Now()
		mux.ServeHTTP(recorder, r)

		status := recorder.status
		if status == 0 {
			status = http.StatusOK
		}
		logger.Info("http request",
			"request_id", requestID,
			"method", r.Method,
			"path", r.URL.Path,
			"status", status,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})

	return &gatewayRuntime{
		handler:    handler,
		transports: []*http.Transport{expressTransport, nestTransport},
	}
}

func (g *gatewayRuntime) CloseIdleConnections() {
	for _, transport := range g.transports {
		if transport != nil {
			transport.CloseIdleConnections()
		}
	}
}

func newHandler(logger *slog.Logger, cfg config) http.Handler {
	return newGatewayRuntime(logger, cfg).handler
}
