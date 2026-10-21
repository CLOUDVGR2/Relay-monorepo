// Package main contains job status handlers logic for the Relay jobs API.

package main

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func jobHistoryHandler(store jobStatusStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		ownerID := strings.TrimSpace(c.Query("ownerId"))
		if ownerID == "" {
			writeError(c, http.StatusBadRequest, "ownerId is required")
			return
		}

		limit := 50
		if raw := c.Query("limit"); raw != "" {
			value, err := strconv.Atoi(raw)
			if err != nil || value < 1 || value > 100 {
				writeError(c, http.StatusBadRequest, "limit must be between 1 and 100")
				return
			}
			limit = value
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		jobs, err := store.List(ctx, ownerID, limit)
		if err != nil {
			writeError(c, http.StatusServiceUnavailable, "job history is temporarily unavailable")
			return
		}

		c.JSON(http.StatusOK, gin.H{"jobs": jobs})
	}
}

func jobDetailHandler(store jobStatusStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		ownerID := strings.TrimSpace(c.Query("ownerId"))
		if ownerID == "" {
			writeError(c, http.StatusBadRequest, "ownerId is required")
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		job, err := store.Get(ctx, ownerID, c.Param("id"))
		if errors.Is(err, ErrJobStatusNotFound) {
			writeError(c, http.StatusNotFound, "job not found")
			return
		}
		if err != nil {
			writeError(c, http.StatusServiceUnavailable, "job status is temporarily unavailable")
			return
		}

		c.JSON(http.StatusOK, job)
	}
}
