// Package main contains handler logic for the Relay jobs worker.

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	attemptHeader  = "x-attempt"
	errorHeader    = "x-last-error"
	reasonHeader   = "x-dead-letter-reason"
	publishTimeout = 10 * time.Second
)

type messagePublisher interface {
	publish(
		ctx context.Context,
		queue string,
		body []byte,
		headers amqp.Table,
	) error
}

func publishWithTimeout(
	publisher messagePublisher,
	queue string,
	body []byte,
	headers amqp.Table,
) error {
	return publishWithContext(
		context.Background(),
		publisher,
		queue,
		body,
		headers,
	)
}

// publishWithContext applies a publish timeout without discarding the
// caller's cancellation signal or deadline.
func publishWithContext(
	parentCtx context.Context,
	publisher messagePublisher,
	queue string,
	body []byte,
	headers amqp.Table,
) error {
	ctx, cancel := context.WithTimeout(parentCtx, publishTimeout)
	defer cancel()

	return publisher.publish(ctx, queue, body, headers)
}

// handleMessage preserves compatibility with existing callers and tests.
func handleMessage(
	message amqp.Delivery,
	publisher messagePublisher,
	processor *JobProcessor,
) error {
	return handleMessageContext(
		context.Background(),
		message,
		publisher,
		processor,
	)
}

// handleMessageContext processes a delivery using the supplied context.
func handleMessageContext(
	ctx context.Context,
	message amqp.Delivery,
	publisher messagePublisher,
	processor *JobProcessor,
) error {
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("message handling canceled: %w", err)
	}

	var job Job

	if err := json.Unmarshal(message.Body, &job); err != nil {
		log.Printf("Invalid job JSON: %v", err)

		headers := copyHeaders(message.Headers)
		headers[reasonHeader] = "invalid JSON"
		headers[errorHeader] = err.Error()

		if err := publishWithContext(
			ctx,
			publisher,
			deadQueue,
			message.Body,
			headers,
		); err != nil {
			return fmt.Errorf("send invalid message to DLQ: %w", err)
		}

		if err := ctx.Err(); err != nil {
			return fmt.Errorf("acknowledgment canceled: %w", err)
		}

		if err := message.Ack(false); err != nil {
			return fmt.Errorf("acknowledge invalid message: %w", err)
		}

		return nil
	}

	attempt := readAttempt(message.Headers)
	log.Printf(
		"Received job %s (type: %s, attempt: %d)",
		job.ID,
		job.Type,
		attempt+1,
	)

	processor.updateJobStatus(job, "processing", attempt+1, "")

	processed, err := processor.ProcessContext(ctx, job)
	if err != nil {
		if ctx.Err() != nil {
			return fmt.Errorf("process job canceled: %w", ctx.Err())
		}

		log.Printf("Job processing failed: %v", err)

		headers := copyHeaders(message.Headers)
		headers[errorHeader] = err.Error()

		retryQueue, nextAttempt, delay, deadLetter := retryDecision(attempt)

		if deadLetter {
			headers[reasonHeader] = "maximum attempts exceeded"

			if publishErr := publishWithContext(
				ctx,
				publisher,
				deadQueue,
				message.Body,
				headers,
			); publishErr != nil {
				return fmt.Errorf("send exhausted job to DLQ: %w", publishErr)
			}

			processor.updateJobStatus(job, "failed", attempt+1, err.Error())

			if err := ctx.Err(); err != nil {
				return fmt.Errorf("acknowledgment canceled: %w", err)
			}

			log.Printf("Job %s sent to dead-letter queue", job.ID)
			if err := message.Ack(false); err != nil {
				return fmt.Errorf("acknowledge dead-lettered job: %w", err)
			}

			return nil
		}

		headers[attemptHeader] = int32(nextAttempt)

		if publishErr := publishWithContext(
			ctx,
			publisher,
			retryQueue,
			message.Body,
			headers,
		); publishErr != nil {
			return fmt.Errorf("publish job to retry queue: %w", publishErr)
		}

		processor.updateJobStatus(job, "retrying", nextAttempt+1, err.Error())

		if err := ctx.Err(); err != nil {
			return fmt.Errorf("acknowledgment canceled: %w", err)
		}

		log.Printf(
			"Job %s scheduled for retry %d after %s",
			job.ID,
			nextAttempt+1,
			delay,
		)

		if err := message.Ack(false); err != nil {
			return fmt.Errorf("acknowledge retried job: %w", err)
		}

		return nil
	}

	if !processed {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("acknowledgment canceled: %w", err)
		}

		processor.updateJobStatus(job, "completed", attempt+1, "")

		log.Printf("Duplicate job %s skipped", job.ID)
		if err := message.Ack(false); err != nil {
			return fmt.Errorf("acknowledge duplicate job: %w", err)
		}

		return nil
	}

	if err := ctx.Err(); err != nil {
		return fmt.Errorf("acknowledgment canceled: %w", err)
	}

	processor.updateJobStatus(job, "completed", attempt+1, "")

	if err := message.Ack(false); err != nil {

		return fmt.Errorf("acknowledge completed job: %w", err)
	}

	log.Printf("Job %s completed successfully", job.ID)
	return nil
}

func readAttempt(headers amqp.Table) int {
	if headers == nil {
		return 0
	}

	switch value := headers[attemptHeader].(type) {
	case int:
		if value >= 0 {
			return value
		}
	case int32:
		if value >= 0 {
			return int(value)
		}
	case int64:
		if value >= 0 {
			return int(value)
		}
	case string:
		n, err := strconv.Atoi(value)
		if err == nil && n >= 0 {
			return n
		}
	}

	return 0
}

func copyHeaders(original amqp.Table) amqp.Table {
	copied := make(amqp.Table, len(original)+3)

	for key, value := range original {
		copied[key] = value
	}

	copied["x-worker-updated-at"] = time.Now().UTC().Format(time.RFC3339)
	return copied
}
