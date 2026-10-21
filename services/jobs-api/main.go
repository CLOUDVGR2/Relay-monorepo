// Package main starts the Relay jobs API application.

package main

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	redis "github.com/redis/go-redis/v9"
)

type healthResponse struct {
	Status  string `json:"status"`
	Service string `json:"service"`
}

type submitJobRequest struct {
	ID      string `json:"id"`
	OwnerID string `json:"ownerId"`
	Type    string `json:"type"`
	Message string `json:"message"`
}

type submitJobResponse struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

type errorResponse struct {
	Error string `json:"error"`
}

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

func writeError(c *gin.Context, status int, message string) {
	c.JSON(status, errorResponse{Error: message})
}

func healthHandler(c *gin.Context) {
	c.JSON(http.StatusOK, healthResponse{
		Status: "ok", Service: "go-api",
	})
}

func readinessHandler(publisher JobPublisher) gin.HandlerFunc {
	return func(c *gin.Context) {
		if publisher == nil || !publisher.Ready() {
			writeError(c, http.StatusServiceUnavailable, "required dependency unavailable")
			return
		}

		c.JSON(http.StatusOK, healthResponse{
			Status: "ready", Service: "go-api",
		})
	}
}

func internalAuth(token string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if strings.TrimSpace(token) == "" {
			writeError(c, http.StatusServiceUnavailable, "internal API authentication is not configured")
			c.Abort()
			return
		}

		const prefix = "Bearer "
		header := c.GetHeader("Authorization")
		if len(header) < len(prefix) ||
			!strings.EqualFold(header[:len(prefix)], prefix) {
			c.Header("WWW-Authenticate", "Bearer")
			writeError(c, http.StatusUnauthorized, "unauthorized")
			c.Abort()
			return
		}

		provided := strings.TrimSpace(header[len(prefix):])
		if provided == "" ||
			subtle.ConstantTimeCompare([]byte(provided), []byte(token)) != 1 {
			c.Header("WWW-Authenticate", "Bearer")
			writeError(c, http.StatusUnauthorized, "unauthorized")
			c.Abort()
			return
		}

		c.Next()
	}
}

func newJobID() (string, error) {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", fmt.Errorf("generate job ID: %w", err)
	}
	return hex.EncodeToString(value[:]), nil
}

func submitJobHandler(publisher JobPublisher) gin.HandlerFunc {
	return submitJobHandlerWithStore(publisher, nil)
}

func submitJobHandlerWithStore(publisher JobPublisher, store jobStatusStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 64*1024)

		decoder := json.NewDecoder(c.Request.Body)
		decoder.DisallowUnknownFields()

		var input submitJobRequest
		if err := decoder.Decode(&input); err != nil {
			writeError(c, http.StatusBadRequest, "invalid JSON request")
			return
		}

		if err := decoder.Decode(&struct{}{}); err != io.EOF {
			writeError(c, http.StatusBadRequest, "request must contain a single JSON object")
			return
		}

		input.ID = strings.TrimSpace(input.ID)
		input.Type = strings.TrimSpace(input.Type)
		input.Message = strings.TrimSpace(input.Message)

		if input.Type != "welcome" {
			writeError(c, http.StatusBadRequest, "unsupported job type; supported type: welcome")
			return
		}
		if input.Message == "" {
			writeError(c, http.StatusBadRequest, "message is required for welcome jobs")
			return
		}
		if len(input.Message) > 10_000 {
			writeError(c, http.StatusBadRequest, "message must not exceed 10000 characters")
			return
		}
		if len(input.ID) > 128 {
			writeError(c, http.StatusBadRequest, "job ID must not exceed 128 characters")
			return
		}
		if input.ID == "" {
			id, err := newJobID()
			if err != nil {
				writeError(c, http.StatusInternalServerError, "could not generate job ID")
				return
			}
			input.ID = id
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		if publisher == nil {
			writeError(c, http.StatusServiceUnavailable, "job queue is temporarily unavailable")
			return
		}

		if store != nil {
			input.OwnerID = strings.TrimSpace(input.OwnerID)
			if input.OwnerID == "" {
				writeError(c, http.StatusBadRequest, "ownerId is required")
				return
			}
			job := Job{ID: input.ID, OwnerID: input.OwnerID, Type: input.Type, Message: input.Message}
			if err := store.Create(ctx, job, input.OwnerID); err != nil {
				log.Printf("Job status creation failed (id=%s): %v", input.ID, err)
				writeError(c, http.StatusServiceUnavailable, "job status storage is temporarily unavailable")
				return
			}
		}

		if err := publisher.Publish(ctx, Job{
			ID: input.ID, OwnerID: input.OwnerID, Type: input.Type, Message: input.Message,
		}); err != nil {
			log.Printf("Job submission failed (id=%s): %v", input.ID, err)
			if store != nil {
				statusCtx, statusCancel := context.WithTimeout(context.Background(), 2*time.Second)
				statusErr := store.Update(statusCtx, input.ID, input.OwnerID, "failed", 0, "job queue publish failed")
				statusCancel()

				if statusErr != nil {
					log.Printf("Job status update failed (id=%s): %v", input.ID, statusErr)
				}
			}
			writeError(c, http.StatusServiceUnavailable, "job queue is temporarily unavailable")
			return
		}

		c.JSON(http.StatusAccepted, submitJobResponse{
			ID: input.ID, Status: "queued",
		})
	}
}

func corsMiddleware() gin.HandlerFunc {
	allowedOrigins := strings.Split(os.Getenv("CLIENT_URL"), ",")
	if strings.TrimSpace(os.Getenv("CLIENT_URL")) == "" {
		allowedOrigins = []string{
			"http://localhost:5173",
			"http://localhost:5174",
		}
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")

		for _, allowed := range allowedOrigins {
			if origin != "" && origin == strings.TrimSpace(allowed) {
				c.Header("Access-Control-Allow-Origin", origin)
				c.Header("Access-Control-Allow-Credentials", "true")
				c.Header("Vary", "Origin")
				c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization, X-Requested-With")
				break
			}
		}

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

func newHandler(publisher JobPublisher, token string) http.Handler {
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(requestIDMiddleware(), accessLogMiddleware(), gin.Recovery())
	router.Use(corsMiddleware())

	router.GET("/healthz", healthHandler)
	router.GET("/readyz", readinessHandler(publisher))
	internal := router.Group("/internal/v1")
	internal.Use(internalAuth(token))
	internal.POST("/jobs", submitJobHandler(publisher))

	return router
}

func newHandlerWithStore(
	publisher JobPublisher,
	token string,
	store jobStatusStore,
) http.Handler {
	return newHandlerWithStoreAndWorkerHealth(publisher, token, store, nil, false)
}

func newHandlerWithWorkerHealth(
	publisher JobPublisher,
	token string,
	store jobStatusStore,
	worker workerHealthChecker,
) http.Handler {
	return newHandlerWithStoreAndWorkerHealth(publisher, token, store, worker, true)
}

func newHandlerWithStoreAndWorkerHealth(
	publisher JobPublisher,
	token string,
	store jobStatusStore,
	worker workerHealthChecker,
	requireWorker bool,
) http.Handler {
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(requestIDMiddleware(), accessLogMiddleware(), gin.Recovery())
	router.Use(corsMiddleware())

	router.GET("/healthz", healthHandler)
	router.GET("/rabbitmqz", func(c *gin.Context) {
		if publisher == nil || !publisher.Ready() {
			c.JSON(http.StatusServiceUnavailable, healthResponse{
				Status:  "unavailable",
				Service: "rabbitmq",
			})
			return
		}
		c.JSON(http.StatusOK, healthResponse{
			Status:  "ready",
			Service: "rabbitmq",
		})
	})

	router.GET("/readyz", func(c *gin.Context) {
		if publisher == nil || !publisher.Ready() || store == nil ||
			(requireWorker && (worker == nil || !worker.Ready(c.Request.Context()))) {
			writeError(c, http.StatusServiceUnavailable, "required dependency unavailable")
			return
		}
		c.JSON(http.StatusOK, healthResponse{
			Status:  "ready",
			Service: "go-api",
		})
	})

	internal := router.Group("/internal/v1")
	internal.Use(internalAuth(token))
	internal.POST("/jobs", submitJobHandlerWithStore(publisher, store))

	if store != nil {
		internal.GET("/jobs", jobHistoryHandler(store))
		internal.GET("/jobs/:id", jobDetailHandler(store))
	}

	return router
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	token := os.Getenv("INTERNAL_API_TOKEN")
	if strings.TrimSpace(token) == "" {
		log.Fatal("INTERNAL_API_TOKEN must be configured")
	}

	rabbitURL, err := rabbitMQURLFromEnv()
	if err != nil {
		log.Fatalf("RabbitMQ configuration: %v", err)
	}

	publisher, err := newRabbitMQPublisher(rabbitURL)
	if err != nil {
		log.Fatalf("RabbitMQ startup: %v", err)
	}
	defer func() {
		if err := publisher.Close(); err != nil {
			log.Printf("RabbitMQ shutdown: %v", err)
		}
	}()

	redisURL := strings.TrimSpace(os.Getenv("REDIS_URL"))
	if redisURL == "" {
		log.Fatal("REDIS_URL must be configured")
	}
	redisOptions, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("Redis configuration: %v", err)
	}
	redisClient := redis.NewClient(redisOptions)
	redisCtx, redisCancel := context.WithTimeout(context.Background(), 5*time.Second)
	if err := redisClient.Ping(redisCtx).Err(); err != nil {
		redisCancel()
		_ = redisClient.Close()
		log.Fatalf("Redis startup: %v", err)
	}
	redisCancel()
	defer func() {
		if err := redisClient.Close(); err != nil {
			log.Printf("Redis shutdown: %v", err)
		}
	}()
	store := newRedisJobStatusStore(redisClient)

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           newHandlerWithWorkerHealth(publisher, token, store, &redisWorkerHealthChecker{client: redisClient}),
		ReadHeaderTimeout: 5 * time.Second,
		MaxHeaderBytes:    1 << 20, // Bound header parsing and per-connection memory.
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("Go API listening on %s", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("HTTP server failed: %v", err)
			stop()
		}
	}()

	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("Graceful shutdown failed: %v", err)
		_ = server.Close()
	}
}
