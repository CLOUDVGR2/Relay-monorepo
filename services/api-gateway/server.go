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
	"net/netip"
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

func requestPeerIP(remoteAddr string) (netip.Addr, bool) {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		host = remoteAddr
	}
	addr, err := netip.ParseAddr(host)
	if err != nil {
		return netip.Addr{}, false
	}
	return addr.Unmap().WithZone(""), true
}

func trustedProxy(peer netip.Addr, prefixes []netip.Prefix) bool {
	for _, prefix := range prefixes {
		if prefix.Contains(peer) {
			return true
		}
	}
	return false
}

func rightmostForwardedIP(values []string) (netip.Addr, bool) {
	parts := strings.Split(strings.Join(values, ","), ",")
	for i := len(parts) - 1; i >= 0; i-- {
		addr, err := netip.ParseAddr(strings.TrimSpace(parts[i]))
		if err == nil {
			return addr.Unmap().WithZone(""), true
		}
	}
	return netip.Addr{}, false
}

func connectionScheme(r *http.Request) string {
	if r.TLS != nil {
		return "https"
	}
	return "http"
}

func forwardingMetadata(r *http.Request, trustedCIDRs []netip.Prefix) (string, string) {
	peer, ok := requestPeerIP(r.RemoteAddr)
	if !ok {
		return "", connectionScheme(r)
	}

	clientIP := peer.String()
	proto := connectionScheme(r)
	if !trustedProxy(peer, trustedCIDRs) {
		return clientIP, proto
	}

	if forwardedIP, valid := rightmostForwardedIP(r.Header.Values("X-Forwarded-For")); valid {
		clientIP = forwardedIP.String()
	}
	if forwardedProto := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")); forwardedProto == "http" || forwardedProto == "https" {
		proto = forwardedProto
	}
	return clientIP, proto
}

func newReverseProxy(rawURL string, logger *slog.Logger, responseHeaderTimeout time.Duration, trustedCIDRs []netip.Prefix) (http.Handler, *http.Transport) {
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
		ResponseHeaderTimeout: responseHeaderTimeout,
		ExpectContinueTimeout: 1 * time.Second,
	}
	proxy := &httputil.ReverseProxy{Transport: transport}
	proxy.Rewrite = func(pr *httputil.ProxyRequest) {
		pr.SetURL(target)

		// Trust forwarded metadata only when the immediate peer is trusted.
		pr.Out.Header.Del("X-Forwarded-For")
		pr.Out.Header.Del("X-Forwarded-Host")
		pr.Out.Header.Del("X-Forwarded-Proto")

		clientIP, proto := forwardingMetadata(pr.In, trustedCIDRs)
		if clientIP != "" {
			pr.Out.Header.Set("X-Forwarded-For", clientIP)
		}
		pr.Out.Header.Set("X-Forwarded-Host", pr.In.Host)
		pr.Out.Header.Set("X-Forwarded-Proto", proto)

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
	handler        http.Handler
	metricsHandler http.Handler
	transports     []*http.Transport
}

func newReadinessHandler(expressURL, nestURL string) http.HandlerFunc {
	client := &http.Client{Timeout: 2 * time.Second}

	return func(w http.ResponseWriter, r *http.Request) {
		dependencies := make(map[string]string, 2)

		probe := func(name, baseURL, path string) {
			target := strings.TrimRight(baseURL, "/") + path
			req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target, nil)
			if err != nil {
				dependencies[name] = "unavailable"
				return
			}

			resp, err := client.Do(req)
			if err != nil {
				if resp != nil {
					_ = resp.Body.Close()
				}
				dependencies[name] = "unavailable"
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode >= http.StatusOK && resp.StatusCode < http.StatusMultipleChoices {
				dependencies[name] = "ok"
			} else {
				dependencies[name] = "unavailable"
			}
		}

		probe("express", expressURL, "/api/health/ready")
		probe("nest", nestURL, "/health/ready")

		ready := dependencies["express"] == "ok" && dependencies["nest"] == "ok"
		status := http.StatusOK
		message := "ready"
		if !ready {
			status = http.StatusServiceUnavailable
			message = "not_ready"
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":       message,
			"dependencies": dependencies,
		})
	}
}

func newGatewayRuntime(logger *slog.Logger, cfg config) *gatewayRuntime {
	mux := http.NewServeMux()

	// Gateway-owned API documentation; NestJS documentation remains at /docs.
	mux.HandleFunc("GET /gateway/openapi.json", gatewayOpenAPISpecHandler)
	mux.HandleFunc("GET /gateway/docs", gatewaySwaggerUIHandler)

	// Liveness only checks the gateway process; it does not depend on backends.
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("{\"status\":\"ok\"}\n"))
	})

	mux.HandleFunc("GET /readyz", newReadinessHandler(cfg.ExpressURL, cfg.NestURL))

	expressProxy, expressTransport := newReverseProxy(cfg.ExpressURL, logger, 75*time.Second, cfg.TrustedProxyCIDRs)
	socketIOProxy, socketIOTransport := newReverseProxy(cfg.ExpressURL, logger, 0, cfg.TrustedProxyCIDRs)
	nestProxy, nestTransport := newReverseProxy(cfg.NestURL, logger, 10*time.Second, cfg.TrustedProxyCIDRs)

	// Keep the initial public route allowlist narrow. Internal Go job endpoints
	// and Python internal APIs are deliberately not exposed by this first pass.
	mux.Handle("/api", expressProxy)
	mux.Handle("/api/", expressProxy)
	mux.Handle("/socket.io/", socketIOProxy)
	mux.Handle("/jobs", nestProxy)
	mux.Handle("/jobs/", nestProxy)
	mux.Handle("/graphql", nestProxy)
	mux.Handle("/graphql/", nestProxy)
	mux.Handle("/calls", nestProxy)
	mux.Handle("/calls/", nestProxy)
	mux.Handle("/docs", nestProxy)
	mux.Handle("/docs/", nestProxy)
	mux.Handle("/health", nestProxy)
	mux.Handle("/health/", nestProxy)

	metrics := newGatewayMetrics()

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
		elapsed := time.Since(start)
		metrics.observe(
			gatewayMetricMethod(r.Method),
			gatewayMetricRoute(r.URL.Path),
			status,
			elapsed,
		)
		logger.Info("http request",
			"request_id", requestID,
			"method", r.Method,
			"path", r.URL.Path,
			"status", status,
			"duration_ms", elapsed.Milliseconds(),
		)
	})

	return &gatewayRuntime{
		handler:        handler,
		metricsHandler: metrics.handler(),
		transports:     []*http.Transport{expressTransport, socketIOTransport, nestTransport},
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
