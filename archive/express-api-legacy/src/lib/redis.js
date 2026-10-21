/** Redis module for the Relay archived legacy Express implementation. */

import { createClient } from "redis";

/**
 * Redis infrastructure for the current Node.js process.
 *
 * Responsibilities:
 * - Own one shared Redis client.
 * - Validate required connection configuration.
 * - Expose explicit connection and shutdown operations.
 * - Surface asynchronous client errors.
 *
 * This singleton is process-local. Multiple application instances
 * have separate clients but can share the same Redis deployment.
 */

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error(
    "REDIS_URL is required. Configure it before starting the application.",
  );
}

/**
 * Create the shared Redis client.
 *
 * Do not create Redis clients inside request handlers. Reusing a client
 * avoids unnecessary connections and connection-management overhead.
 */
export const redis = createClient({
  url: redisUrl,
});

/**
 * Track connection state to prevent concurrent startup calls from
 * attempting to connect the same client simultaneously.
 */
let connectionAttempt;

/**
 * Log asynchronous Redis client errors.
 *
 * In production, replace console logging with your structured logger
 * and export connection/error metrics to your monitoring system.
 */
redis.on("error", (error) => {
  console.error("[redis] Client error", {
    name: error.name,
    message: error.message,
  });
});

/**
 * Connect to Redis.
 *
 * Concurrent callers share the same in-flight connection attempt.
 * Failed attempts propagate to the caller; they are not silently ignored.
 *
 * @returns {Promise<void>}
 */
export const connectRedis = async () => {
  if (redis.isReady) {
    return;
  }

  if (connectionAttempt) {
    return connectionAttempt;
  }

  if (redis.isOpen) {
    throw new Error(
      "Redis connection is open but not ready. Check client health.",
    );
  }

  connectionAttempt = redis.connect();

  try {
    await connectionAttempt;
  } finally {
    connectionAttempt = undefined;
  }
};

/**
 * Gracefully close the Redis client during application shutdown.
 *
 * Stop accepting requests and drain in-flight work before calling this.
 *
 * @returns {Promise<void>}
 */
export const disconnectRedis = async () => {
  if (!redis.isOpen) {
    return;
  }

  await redis.quit();
};
