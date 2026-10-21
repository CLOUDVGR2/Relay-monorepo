/** Application startup and dependency wiring for the Relay archived legacy Express implementation. */

import "dotenv/config";

import { connectRedis } from "./lib/redis.js";

// Establish Redis connectivity before loading the application.
// The application imports its routes and initializes the rate-limit stores.
await connectRedis();

console.log("[startup] Redis connected.");

await import("./index.js");
