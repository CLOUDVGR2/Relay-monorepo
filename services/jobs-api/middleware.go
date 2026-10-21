// Package main contains middleware logic for the Relay jobs API.

package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const requestIDHeader = "X-Request-ID"

type requestIDContextKey struct{}

func requestIDFromContext(ctx context.Context) string {
	value, _ := ctx.Value(requestIDContextKey{}).(string)
	return value
}

func validRequestID(value string) bool {
	if len(value) == 0 || len(value) > 128 {
		return false
	}

	for _, char := range value {
		if (char >= 'a' && char <= 'z') ||
			(char >= 'A' && char <= 'Z') ||
			(char >= '0' && char <= '9') ||
			char == '-' || char == '_' || char == '.' {
			continue
		}
		return false
	}

	return true
}

func generateRequestID() (string, error) {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(value[:]), nil
}

func requestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := strings.TrimSpace(c.GetHeader(requestIDHeader))

		if !validRequestID(requestID) {
			var err error
			requestID, err = generateRequestID()
			if err != nil {
				writeError(c, http.StatusInternalServerError, "could not initialize request")
				c.Abort()
				return
			}
		}

		c.Set("request_id", requestID)
		c.Header(requestIDHeader, requestID)
		c.Request = c.Request.WithContext(
			context.WithValue(c.Request.Context(), requestIDContextKey{}, requestID),
		)

		c.Next()
	}
}

func accessLogMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		started := time.Now()
		c.Next()

		log.Printf(
			"http_request request_id=%q method=%q path=%q status=%d duration_ms=%d",
			c.GetString("request_id"),
			c.Request.Method,
			c.Request.URL.Path,
			c.Writer.Status(),
			time.Since(started).Milliseconds(),
		)
	}
}
