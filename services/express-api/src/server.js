/** HTTP server bootstrap for the Relay Express API. */

import "dotenv/config";

import mongoose from "mongoose";
import { connectDB } from "./lib/db.js";
import { redis, disconnectRedis } from "./lib/redis.js";
import { app, server, closeSocketServer, io, getUserRoom } from "./lib/socket.js";
import { createMultiAgentProgressSubscriber } from "./lib/multi-agent-progress-subscriber.js";
import { configureApp } from "./app.js";

const NODE_ENV = process.env.NODE_ENV || "development";
const PORT = Number(process.env.PORT || 5001);
const SHUTDOWN_TIMEOUT_MS = 10_000;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

let isShuttingDown = false;
let shutdownPromise;

const progressSubscriber = createMultiAgentProgressSubscriber({
  redis,
  io,
  getUserRoom,
});

configureApp(app, () => isShuttingDown);

// Graceful shutdown
// -----------------------------------------------------------------------------

// Coordinate all shutdown requests through one shared promise.
function shutdown(signal) {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  isShuttingDown = true;
  shutdownPromise = performShutdown(signal);

  return shutdownPromise;
}

async function performShutdown(signal) {
  console.log(`${signal} received. Starting graceful shutdown...`);

  let forceExit;

  try {
    // Prevent shutdown from hanging indefinitely.
    forceExit = setTimeout(() => {
      console.error("Graceful shutdown timed out. Forcing process exit.");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    forceExit.unref();

    // Stop progress delivery before closing Socket.IO.
    await progressSubscriber.stop();

    // Close Socket.IO and its underlying HTTP server.
    await closeSocketServer();

    console.log("HTTP and Socket.IO servers closed.");

    // Close MongoDB after the server connections have closed.
    await mongoose.disconnect();
    console.log("MongoDB connections closed.");

    // Close Redis after HTTP traffic and database work have stopped.
    await disconnectRedis();
    console.log("Redis connections closed.");
    console.log("Graceful shutdown completed.");

    process.exitCode = 0;
  } catch (error) {
    console.error("Shutdown failed:", error);
    process.exitCode = 1;
  } finally {
    if (forceExit) {
      clearTimeout(forceExit);
    }
  }
}

// Handle common termination signals from the operating system or host.
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

// -----------------------------------------------------------------------------
// Application startup
// -----------------------------------------------------------------------------

async function startServer() {
  try {
    // Do not accept traffic until the database connection succeeds.
    await connectDB();

    // Subscribe before accepting traffic so progress delivery is ready.
    await progressSubscriber.start();

    // Start the shared HTTP server used by Socket.IO.
    server.listen(PORT, () => {
      console.log(`Relay API listening on port ${PORT} (${NODE_ENV})`);
    });

    // Handle HTTP server startup and runtime errors.
    server.on("error", (error) => {
      console.error("HTTP server error:", error);
      process.exitCode = 1;
    });
  } catch (error) {
    console.error("Failed to start Relay:", error.message);
    process.exitCode = 1;

    // Release resources if startup fails after Redis connects.
    try {
      await progressSubscriber.stop();
    } catch (cleanupError) {
      console.error("Progress subscriber startup cleanup failed:", cleanupError.message);
    }

    try {
      await mongoose.disconnect();
    } catch (cleanupError) {
      console.error("MongoDB startup cleanup failed:", cleanupError.message);
    }

    try {
      await disconnectRedis();
    } catch (cleanupError) {
      console.error("Redis startup cleanup failed:", cleanupError.message);
    }
  }
}

void startServer();
