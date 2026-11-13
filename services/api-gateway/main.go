// Package main starts the Relay API gateway application.

package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := loadConfig()
	if err != nil {
		logger.Error("invalid gateway configuration", "error", err)
		os.Exit(1)
	}

	runtime := newGatewayRuntime(logger, cfg)
	defer runtime.CloseIdleConnections()

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           runtime.handler,
		ReadHeaderTimeout: 5 * time.Second,
		MaxHeaderBytes:    1 << 20, // Bound header parsing and per-connection memory.
		ReadTimeout:       15 * time.Second,
		IdleTimeout:       60 * time.Second,
		// WriteTimeout is intentionally unset for future streaming and
		// WebSocket proxy support. Configure upstream and stream limits
		// when proxy routes are introduced.
	}

	metricsServer := &http.Server{
		Addr:              ":9091",
		Handler:           runtime.metricsHandler,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	serverErrors := make(chan error, 2)
	go func() {
		logger.Info("gateway starting", "address", server.Addr)
		serverErrors <- server.ListenAndServe()
	}()
	go func() {
		logger.Info("gateway metrics listener starting", "address", metricsServer.Addr)
		serverErrors <- metricsServer.ListenAndServe()
	}()

	var serveErr error
	select {
	case serveErr = <-serverErrors:
		if !errors.Is(serveErr, http.ErrServerClosed) {
			logger.Error("gateway listener failed", "error", serveErr)
		}
	case <-ctx.Done():
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("gateway shutdown failed", "error", err)
		_ = server.Close()
		_ = metricsServer.Close()
		os.Exit(1)
	}
	if err := metricsServer.Shutdown(shutdownCtx); err != nil {
		logger.Error("metrics listener shutdown failed", "error", err)
		_ = metricsServer.Close()
		os.Exit(1)
	}
	logger.Info("gateway stopped")
	if serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
		os.Exit(1)
	}
}
