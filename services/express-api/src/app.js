/** Express middleware and route composition for the Relay Express API. */

import "dotenv/config";

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import path from "node:path";
import { setupSwagger } from "./swagger.js";
import { redis } from "./lib/redis.js";

import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import incidentRoutes from "./routes/incidents.route.js";
import aiRoutes from "./routes/ai.route.js";

// Express configuration
// -----------------------------------------------------------------------------

const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";

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

export function configureApp(app, getIsShuttingDown = () => false) {
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

/**
 * @swagger
 * /api/health/live:
 *   get:
 *     tags: [Health]
 *     summary: Liveness probe
 *     description: Confirms that the HTTP application is responding. Used by Kubernetes liveness probes.
 *     responses:
 *       200:
 *         description: Service is alive
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *       503:
 *         description: Service is shutting down
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: ["shutting_down"]
 */
app.get("/api/health/live", (_req, res) => {
  if (getIsShuttingDown()) {
    return res.status(503).json({
      status: "shutting_down",
    });
  }

  return res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /api/health/ready:
 *   get:
 *     tags: [Health]
 *     summary: Readiness probe
 *     description: Confirms that the application is ready to handle requests, including database connectivity. Used by Kubernetes readiness probes.
 *     responses:
 *       200:
 *         description: Service is ready
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReadinessResponse'
 *       503:
 *         description: Service is not ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: ["not_ready"]
 *                 reason:
 *                   type: string
 *                   example: "shutting_down"
 *                 database:
 *                   type: string
 *                   enum: ["disconnected"]
 */
app.get("/api/health/redis", async (_req, res) => {
  let timeout;
  try {
    const result = await Promise.race([
      redis.ping(),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Redis probe timed out")),
          2000,
        );
      }),
    ]);

    if (result !== "PONG") {
      return res.status(503).json({
        status: "unavailable",
        dependency: "redis",
      });
    }

    return res.status(200).json({
      status: "ready",
      dependency: "redis",
    });
  } catch {
    return res.status(503).json({
      status: "unavailable",
      dependency: "redis",
    });
  } finally {
    clearTimeout(timeout);
  }
});

app.get("/api/health/ready", (_req, res) => {
  if (getIsShuttingDown()) {
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
// API Documentation
// -----------------------------------------------------------------------------

// Setup Swagger/OpenAPI documentation
setupSwagger(app);

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

}
