// Package main contains config logic for the Relay jobs worker.

package main

import (
	"fmt"
	"net/url"
	"os"
	"strings"
)

func rabbitMQURLFromEnv() (string, error) {
	host := strings.TrimSpace(os.Getenv("RABBITMQ_HOST"))
	if host == "" {
		host = "localhost:5672"
	}

	username := os.Getenv("RABBITMQ_DEFAULT_USER")
	password := os.Getenv("RABBITMQ_DEFAULT_PASS")

	if strings.TrimSpace(username) == "" {
		return "", fmt.Errorf("RABBITMQ_DEFAULT_USER must not be empty")
	}

	if strings.TrimSpace(password) == "" {
		return "", fmt.Errorf("RABBITMQ_DEFAULT_PASS must not be empty")
	}

	u := url.URL{
		Scheme: "amqp",
		User:   url.UserPassword(username, password),
		Host:   host,
	}

	return u.String(), nil
}
