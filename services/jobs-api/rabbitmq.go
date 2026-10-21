// Package main contains rabbitmq logic for the Relay jobs API.

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"sync/atomic"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	jobsQueue             = "go.jobs"
	initialReconnectDelay = time.Second
	maxReconnectDelay     = 30 * time.Second
)

type Job struct {
	ID      string `json:"id"`
	OwnerID string `json:"ownerId,omitempty"`
	Type    string `json:"type"`
	Message string `json:"message"`
}

type JobPublisher interface {
	Publish(context.Context, Job) error
	Ready() bool
	Close() error
}

type rabbitMQPublisher struct {
	url      string
	conn     *amqp.Connection
	ch       *amqp.Channel
	confirms chan amqp.Confirmation

	mu        sync.Mutex
	ready     atomic.Bool
	closed    atomic.Bool
	closeOnce sync.Once

	reconnect chan struct{}
	done      chan struct{}
}

func openRabbitMQSession(url string) (
	*amqp.Connection,
	*amqp.Channel,
	chan amqp.Confirmation,
	error,
) {
	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("connect to RabbitMQ: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		return nil, nil, nil, fmt.Errorf("open RabbitMQ channel: %w", err)
	}

	if err := ch.Confirm(false); err != nil {
		_ = ch.Close()
		_ = conn.Close()
		return nil, nil, nil, fmt.Errorf("enable publisher confirms: %w", err)
	}

	if _, err := ch.QueueDeclare(jobsQueue, true, false, false, false, nil); err != nil {
		_ = ch.Close()
		_ = conn.Close()
		return nil, nil, nil, fmt.Errorf("declare jobs queue: %w", err)
	}

	return conn, ch, ch.NotifyPublish(make(chan amqp.Confirmation, 1)), nil
}

func newRabbitMQPublisher(url string) (*rabbitMQPublisher, error) {
	conn, ch, confirms, err := openRabbitMQSession(url)
	if err != nil {
		return nil, err
	}

	p := &rabbitMQPublisher{
		url:       url,
		conn:      conn,
		ch:        ch,
		confirms:  confirms,
		reconnect: make(chan struct{}, 1),
		done:      make(chan struct{}),
	}
	p.ready.Store(true)

	go p.reconnectLoop()

	return p, nil
}

func (p *rabbitMQPublisher) signalReconnect() {
	select {
	case p.reconnect <- struct{}{}:
	default:
	}
}

func (p *rabbitMQPublisher) readyLocked() bool {
	if p == nil || p.closed.Load() || !p.ready.Load() {
		return false
	}

	if p.conn == nil || p.ch == nil || p.conn.IsClosed() || p.ch.IsClosed() {
		p.ready.Store(false)
		p.signalReconnect()
		return false
	}

	return true
}

func (p *rabbitMQPublisher) Ready() bool {
	if p == nil {
		return false
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	return p.readyLocked()
}

func (p *rabbitMQPublisher) invalidateLocked() {
	p.ready.Store(false)

	if p.ch != nil {
		_ = p.ch.Close()
		p.ch = nil
	}
	if p.conn != nil {
		_ = p.conn.Close()
		p.conn = nil
	}

	p.confirms = nil

	if !p.closed.Load() {
		p.signalReconnect()
	}
}

func (p *rabbitMQPublisher) Publish(ctx context.Context, job Job) error {
	if p == nil {
		return fmt.Errorf("RabbitMQ publisher is unavailable")
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	if !p.readyLocked() {
		return fmt.Errorf("RabbitMQ publisher is unavailable")
	}

	body, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("encode job: %w", err)
	}

	if err := p.ch.PublishWithContext(
		ctx, "", jobsQueue, true, false,
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Timestamp:    time.Now().UTC(),
			MessageId:    job.ID,
			Body:         body,
		},
	); err != nil {
		p.invalidateLocked()
		return fmt.Errorf("publish job: %w", err)
	}

	select {
	case confirmation, ok := <-p.confirms:
		if !ok {
			p.invalidateLocked()
			return fmt.Errorf("RabbitMQ confirmation channel closed")
		}
		if !confirmation.Ack {
			p.invalidateLocked()
			return fmt.Errorf("RabbitMQ negatively acknowledged job")
		}
		return nil

	case <-ctx.Done():
		// Discard this channel so a late confirmation cannot be confused
		// with a confirmation for a future job.
		p.invalidateLocked()
		return fmt.Errorf("await RabbitMQ confirmation: %w", ctx.Err())
	}
}

func (p *rabbitMQPublisher) reconnectLoop() {
	delay := initialReconnectDelay
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		p.mu.Lock()
		ready := p.readyLocked()
		closed := p.closed.Load()
		p.mu.Unlock()

		if closed {
			return
		}

		if ready {
			select {
			case <-p.done:
				return
			case <-p.reconnect:
			case <-ticker.C:
			}
			continue
		}

		if err := p.reconnectSession(); err == nil {
			log.Printf("RabbitMQ publisher connection restored")
			delay = initialReconnectDelay
			continue
		} else {
			log.Printf("RabbitMQ publisher reconnect failed: %v", err)
		}

		timer := time.NewTimer(delay)
		select {
		case <-p.done:
			if !timer.Stop() {
				<-timer.C
			}
			return
		case <-p.reconnect:
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
		case <-timer.C:
		}

		if delay >= maxReconnectDelay/2 {
			delay = maxReconnectDelay
		} else {
			delay *= 2
		}
	}
}

func (p *rabbitMQPublisher) reconnectSession() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.closed.Load() {
		return fmt.Errorf("publisher is shutting down")
	}

	if p.readyLocked() {
		return nil
	}

	if p.ch != nil {
		_ = p.ch.Close()
		p.ch = nil
	}
	if p.conn != nil {
		_ = p.conn.Close()
		p.conn = nil
	}
	p.confirms = nil

	conn, ch, confirms, err := openRabbitMQSession(p.url)
	if err != nil {
		return err
	}

	if p.closed.Load() {
		_ = ch.Close()
		_ = conn.Close()
		return fmt.Errorf("publisher is shutting down")
	}

	p.conn = conn
	p.ch = ch
	p.confirms = confirms
	p.ready.Store(true)

	return nil
}

func (p *rabbitMQPublisher) Close() error {
	if p == nil {
		return nil
	}

	var firstErr error

	p.closeOnce.Do(func() {
		p.closed.Store(true)
		p.ready.Store(false)
		close(p.done)

		p.mu.Lock()
		defer p.mu.Unlock()

		if p.ch != nil {
			if err := p.ch.Close(); err != nil {
				firstErr = err
			}
			p.ch = nil
		}
		if p.conn != nil {
			if err := p.conn.Close(); err != nil && firstErr == nil {
				firstErr = err
			}
			p.conn = nil
		}
		p.confirms = nil
	})

	return firstErr
}
