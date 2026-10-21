/** Entry point for the archived legacy Express implementation. */

import "dotenv/config";

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import path from "node:path";

import { connectDB } from "./lib/db.js";
import { disconnectRedis } from "./lib/redis.js";
import { app, server, closeSocketServer } from "./lib/socket.js";

import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import incidentRoutes from "./routes/incidents.route.js";
import aiRoutes from "./routes/ai.route.js";

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";
const PORT = Number(process.env.PORT || 5001);
const SHUTDOWN_TIMEOUT_MS = 10_000;

// Reject invalid ports rather than silently starting on an unintended port.
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

// Configure the frontend origin through the environment.
// Multiple origins can be comma-separated.
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173,http://localhost:5174")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// This path assumes the backend is started from its root directory.
const frontendDist = path.resolve(
  process.env.FRONTEND_DIST_PATH || "../apps/web/dist",
);

// Require explicit frontend configuration in production.
if (isProduction && !process.env.CLIENT_URL) {
  throw new Error("CLIENT_URL must be configured in production");
}

// -----------------------------------------------------------------------------
// Shutdown state
// -----------------------------------------------------------------------------

let isShuttingDown = false;
let shutdownPromise;

// -----------------------------------------------------------------------------
// Express configuration and security
// -----------------------------------------------------------------------------

// Hide Express's identifying response header.
app.disable("x-powered-by");

// Only enable this when the deployment actually uses one trusted proxy.
// Adjust the value to match your hosting architecture.
if (isProduction) {
  app.set("trust proxy", 1);
}

// Set common HTTP security headers.
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  }),
);

// Configure which browser origins may call the API with credentials.
app.use(
  cors({
    origin(origin, callback) {
      // Allow requests without an Origin header, such as server-to-server calls.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      const error = new Error("Origin not allowed by CORS");
      error.code = "CORS_ORIGIN_DENIED";

      return callback(error);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["X-Has-More", "X-Next-Cursor"],
  }),
);

// Permit larger JSON bodies only for the two authenticated image-upload routes.
// All other JSON requests retain the global 1 MiB limit.
const imageUploadJsonParser = express.json({ limit: "11mb" });

app.use((req, res, next) => {
  const isMessageUpload =
    req.method === "POST" &&
    /^\/api\/messages\/send\/[^/]+\/?$/.test(req.path);

  const isProfileUpload =
    req.method === "PUT" &&
    req.path === "/api/auth/update-profile";

  if (!isMessageUpload && !isProfileUpload) {
    return next();
  }

  return imageUploadJsonParser(req, res, next);
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Parse cookies so authentication middleware can read cookie-based tokens.
app.use(cookieParser());

// -----------------------------------------------------------------------------
// Health and readiness endpoints
// -----------------------------------------------------------------------------

// Liveness: confirms that the HTTP application is responding.
app.get("/api/health/live", (_req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({
      status: "shutting_down",
    });
  }

  return res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Readiness: confirms that the application is ready to use MongoDB.
app.get("/api/health/ready", (_req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({
      status: "not_ready",
      reason: "shutting_down",
    });
  }

  const databaseReady = mongoose.connection.readyState === 1;

  if (!databaseReady) {
    return res.status(503).json({
      status: "not_ready",
      database: "disconnected",
    });
  }

  return res.status(200).json({
    status: "ready",
    database: "connected",
  });
});

// -----------------------------------------------------------------------------
// API routes
// -----------------------------------------------------------------------------

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/ai", aiRoutes);

// Keep API 404 responses separate from frontend routing.
app.use("/api", (_req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found",
  });
});

// -----------------------------------------------------------------------------
// Frontend delivery
// -----------------------------------------------------------------------------

if (isProduction) {
  // Serve static assets generated by the frontend build.
  app.use(express.static(frontendDist));

  // Let React Router handle frontend routes that aren't API endpoints.
  app.get(/.*/, (req, res, next) => {
    if (req.method !== "GET" || !req.accepts("html")) {
      return next();
    }

    res.sendFile(path.join(frontendDist, "index.html"), (error) => {
      if (error) {
        next(error);
      }
    });
  });
}

// Return a consistent response for any unmatched request.
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Resource not found",
  });
});

// -----------------------------------------------------------------------------
// Centralized error handling
// -----------------------------------------------------------------------------

// Express error middleware must come after routes and other middleware.
app.use((error, _req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error.code === "CORS_ORIGIN_DENIED") {
    return res.status(403).json({
      success: false,
      message: "Request origin is not allowed",
    });
  }

  // Log diagnostic details on the server, not in the client response.
  console.error("Request error:", error);

  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 500
      ? error.status
      : 500;

  // Avoid exposing internal exception messages in production.
  const message =
    status >= 500 && isProduction
      ? "Internal server error"
      : error.message || "Internal server error";

  return res.status(status).json({
    success: false,
    message,
  });
});

// -----------------------------------------------------------------------------
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
