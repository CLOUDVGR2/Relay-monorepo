// Package main contains job logic for the Relay jobs worker.

package main

import (
	"context"
	"errors"
	"fmt"
	"log"
)

type Job struct {
	ID      string `json:"id"`
	OwnerID string `json:"ownerId,omitempty"`
	Type    string `json:"type"`
	Message string `json:"message"`
}

// processJob preserves the existing interface for current callers and tests.
func processJob(job Job) error {
	return processJobContext(context.Background(), job)
}

// processJobContext validates and processes a job while respecting cancellation.
func processJobContext(ctx context.Context, job Job) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	if job.ID == "" {
		return errors.New("job ID is required")
	}

	switch job.Type {
	case "welcome":
		if job.Message == "" {
			return errors.New("welcome job message is required")
		}

		if err := ctx.Err(); err != nil {
			return err
		}

		log.Printf("Processing welcome job %s: %s", job.ID, job.Message)
		return nil

	default:
		return fmt.Errorf("unsupported job type: %s", job.Type)
	}
}
