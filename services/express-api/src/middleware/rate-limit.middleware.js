/** Request middleware for rate limit middleware in the Relay Express API. */

import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../lib/redis.js";

/**
 * Keep rate-limit errors consistent with Relay's API response format.
 * Do not expose internal limiter configuration or implementation details.
 */
function handleRateLimit(_req, res) {
  return res.status(429).json({
    success: false,
    message: "Too many requests. Please try again later.",
  });
}

/**
 * Shared policy for all limiters in this module.
 *
 * standardHeaders exposes standardized rate-limit metadata.
 * legacyHeaders disables the older X-RateLimit-* header format.
 *
 * Redis provides shared counters across application instances.
 * Each limiter uses a unique prefix to keep its counters separate.
 */
const commonOptions = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: handleRateLimit,
};

/**
 * Create a Redis-backed store for a specific rate limiter.
 *
 * Reuse the application's shared Redis client instead of creating
 * a new connection for each limiter.
 *
 * @param {string} prefix - Unique namespace for this limiter's keys.
 */
function createRedisStore(prefix) {
  return new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
    prefix,
  });
}

/**
 * Limit repeated login attempts from one client IP.
 *
 * This reduces simple automated abuse but does not stop distributed attacks
 * or credential attacks spread across many IP addresses.
 */
export const authRateLimiter = rateLimit({
  ...commonOptions,
  store: createRedisStore("relay:ratelimit:auth:"),
  windowMs: 15 * 60 * 1000,
  limit: 10,
});

/**
 * Signup is more restrictive because automated account creation can be abused
 * for spam, resource consumption, and other malicious activity.
 */
export const signupRateLimiter = rateLimit({
  ...commonOptions,
  store: createRedisStore("relay:ratelimit:signup:"),
  windowMs: 60 * 60 * 1000,
  limit: 5,
});

/**
 * Limit message submission bursts without restricting message-reading routes.
 *
 * This is an initial per-IP limit, not a per-user quota. Authenticated users
 * may share a public IP, so tune the policy against real usage before release.
 */
export const sendMessageRateLimiter = rateLimit({
  ...commonOptions,
  store: createRedisStore("relay:ratelimit:messages:"),
  windowMs: 60 * 1000,
  limit: 30,
});

/**
 * Profile updates can trigger external image uploads and consume resources.
 * Keep them less frequent than ordinary reads.
 */
export const incidentMutationRateLimiter = rateLimit({
  ...commonOptions,
  store: createRedisStore("relay:ratelimit:incidents:"),
  windowMs: 60 * 1000,
  limit: 20,
});

/**
 * Profile updates can trigger external image uploads and consume resources.
 * Keep them less frequent than ordinary reads.
 */
export const profileUpdateRateLimiter = rateLimit({
  ...commonOptions,
  store: createRedisStore("relay:ratelimit:profile:"),
  windowMs: 15 * 60 * 1000,
  limit: 10,
});

export const aiAnswerRateLimiter = rateLimit({
  ...commonOptions,
  store: createRedisStore("relay:ratelimit:ai-answer:"),
  windowMs: 60 * 1000,
  limit: 10,
});


export const aiDocumentIngestionRateLimiter = rateLimit({
  ...commonOptions,
  store: createRedisStore("relay:ratelimit:ai-ingestion:"),
  windowMs: 60 * 1000,
  limit: 3,
});
