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

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	serverErrors := make(chan error, 1)
	go func() {
		logger.Info("gateway starting", "address", server.Addr)
		serverErrors <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			logger.Error("gateway server failed", "error", err)
			os.Exit(1)
		}
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := server.Shutdown(shutdownCtx); err != nil {
			logger.Error("graceful shutdown failed", "error", err)
			_ = server.Close()
			os.Exit(1)
		}
		logger.Info("gateway stopped")
	}
}
