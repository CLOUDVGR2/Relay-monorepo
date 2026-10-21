// Package main contains config logic for the Relay API gateway.

package main

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

// config keeps gateway listeners and upstream destinations explicit.
// Docker deployments can override the localhost defaults with service DNS names.
type config struct {
	Port        string
	ExpressURL  string
	NestURL     string
	GoAPIURL    string
	PythonAIURL string
}

func loadConfig() (config, error) {
	port := strings.TrimSpace(os.Getenv("GATEWAY_PORT"))
	if port == "" {
		port = "8090"
	}

	n, err := strconv.Atoi(port)
	if err != nil || n < 1 || n > 65535 {
		return config{}, fmt.Errorf("GATEWAY_PORT must be a valid TCP port (1-65535)")
	}

	cfg := config{
		Port:        strconv.Itoa(n),
		ExpressURL:  envOrDefault("GATEWAY_EXPRESS_URL", "http://127.0.0.1:5001"),
		NestURL:     envOrDefault("GATEWAY_NEST_URL", "http://127.0.0.1:3000"),
		GoAPIURL:    envOrDefault("GATEWAY_GO_URL", "http://127.0.0.1:8081"),
		PythonAIURL: envOrDefault("GATEWAY_PYTHON_URL", "http://127.0.0.1:8000"),
	}

	for name, rawURL := range map[string]string{
		"GATEWAY_EXPRESS_URL": cfg.ExpressURL,
		"GATEWAY_NEST_URL":    cfg.NestURL,
		"GATEWAY_GO_URL":      cfg.GoAPIURL,
		"GATEWAY_PYTHON_URL":  cfg.PythonAIURL,
	} {
		parsed, err := url.ParseRequestURI(rawURL)
		if err != nil || parsed.Host == "" ||
			(parsed.Scheme != "http" && parsed.Scheme != "https") ||
			parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" ||
			(parsed.Path != "" && parsed.Path != "/") || parsed.RawPath != "" {
			return config{}, fmt.Errorf("%s must be an HTTP(S) origin without credentials, query, or fragment", name)
		}
	}

	return cfg, nil
}

func envOrDefault(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}
