// Package main contains redis logic for the Relay jobs worker.

package main

import (
	"context"
	"fmt"
	"net/url"
	"os"

	redis "github.com/redis/go-redis/v9"
)

func newRedisClient(ctx context.Context) (*redis.Client, error) {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		return nil, fmt.Errorf("REDIS_URL must be set")
	}

	parsedURL, err := url.Parse(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse REDIS_URL: %w", err)
	}

	if parsedURL.Scheme != "redis" && parsedURL.Scheme != "rediss" {
		return nil, fmt.Errorf("REDIS_URL must use redis:// or rediss://")
	}

	options, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("configure Redis client: %w", err)
	}

	client := redis.NewClient(options)

	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("connect to Redis: %w", err)
	}

	return client, nil
}
