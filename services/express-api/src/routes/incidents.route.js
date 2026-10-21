/** HTTP route handlers for incidents route in the Relay Express API. */

import express from "express";
import { rateLimit } from "express-rate-limit";

import { protectRoute } from "../middleware/auth.middleware.js";
import { incidentMutationRateLimiter } from "../middleware/rate-limit.middleware.js";
import { redis } from "../lib/redis.js";

const router = express.Router();

const approvalKey = (userId, incidentId) =>
  `relay:incident-approval:${userId}:${incidentId}`;

function trustedOrigin(req, res, next) {
  const allowedOrigins = (
    process.env.CLIENT_URL ||
    "http://localhost:5173,http://localhost:5174"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const origin = req.get("origin");
  if (!origin || !allowedOrigins.includes(origin)) {
    return res.status(403).json({
      success: false,
      message: "Request origin is not allowed",
    });
  }

  return next();
}

function getPythonBaseUrl() {
  return (
    process.env.PYTHON_AI_BASE_URL ||
    (process.env.NODE_ENV === "production"
      ? "http://ai-service:8000"
      : "http://localhost:8000")
  ).replace(/\/+$/, "");
}

async function callPython(req, path, { method = "GET", body } = {}) {
  const token = process.env.PYTHON_AI_INTERNAL_TOKEN;
  if (!token) {
    const error = new Error("Incident service is not configured");
    error.status = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);

  try {
    const response = await fetch(`${getPythonBaseUrl()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Relay-User-Id": String(req.user._id),
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });

    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      const status = [400, 403, 404, 409, 422, 429].includes(response.status)
        ? response.status
        : response.status >= 500
          ? 502
          : 502;

      const error = new Error(
        status === 502
          ? "Incident service is temporarily unavailable"
          : typeof data?.detail === "string"
            ? data.detail
            : "Incident request was rejected",
      );
      error.status = status;
      throw error;
    }

    if (data === null) {
      const error = new Error("Incident service returned an invalid response");
      error.status = 502;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Incident service timed out");
      timeoutError.status = 504;
      throw timeoutError;
    }
    if (error.status) throw error;

    const upstreamError = new Error("Incident service is temporarily unavailable");
    upstreamError.status = 502;
    throw upstreamError;
  } finally {
    clearTimeout(timeout);
  }
}

function sendError(res, error) {
  const status = Number.isInteger(error.status) ? error.status : 502;
  return res.status(status).json({
    success: false,
    message: error.message || "Incident service is temporarily unavailable",
  });
}

router.use(protectRoute);

/**
 * @swagger
 * /api/incidents:
 *   post:
 *     tags: [Incidents]
 *     summary: Create a new incident
 *     description: Creates a new incident scenario for testing and investigation. Requires authenticated session and trusted origin.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               scenario_id:
 *                 type: string
 *                 enum: ["api-latency-spike-v1"]
 *                 description: Type of incident scenario
 *                 example: "api-latency-spike-v1"
 *     responses:
 *       201:
 *         description: Incident created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 incident_id:
 *                   type: string
 *                 status:
 *                   type: string
 *       400:
 *         description: Invalid scenario or request
 *       403:
 *         description: Origin not allowed
 *       503:
 *         description: Incident service unavailable
 */
router.post(
  "/",
  trustedOrigin,
  incidentMutationRateLimiter,
  async (req, res) => {
    try {
      const scenarioId = req.body?.scenario_id ?? "api-latency-spike-v1";
      if (scenarioId !== "api-latency-spike-v1") {
        return res.status(400).json({
          success: false,
          message: "Unsupported incident scenario",
        });
      }

      const result = await callPython(req, "/v1/incidents", {
        method: "POST",
        body: { scenario_id: scenarioId },
      });
      return res.status(201).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  },
);

/**
 * @swagger
 * /api/incidents:
 *   get:
 *     tags: [Incidents]
 *     summary: List incidents
 *     description: Retrieves a paginated list of incidents. Requires authentication.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Maximum number of incidents to return
 *     responses:
 *       200:
 *         description: List of incidents
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       503:
 *         description: Incident service unavailable
 */
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const result = await callPython(req, `/v1/incidents?limit=${limit}`);
    return res.json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

/**
 * @swagger
 * /api/incidents/{incidentId}:
 *   get:
 *     tags: [Incidents]
 *     summary: Get incident details
 *     description: Retrieves detailed information about a specific incident. Requires authentication.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: incidentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Incident identifier
 *     responses:
 *       200:
 *         description: Incident details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: Incident not found
 *       503:
 *         description: Incident service unavailable
 */
router.get("/:incidentId", async (req, res) => {
  try {
    const result = await callPython(
      req,
      `/v1/incidents/${encodeURIComponent(req.params.incidentId)}`,
    );
    return res.json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

/**
 * @swagger
 * /api/incidents/{incidentId}/investigate:
 *   post:
 *     tags: [Incidents]
 *     summary: Investigate incident
 *     description: Triggers AI-powered investigation of an incident. Requires authentication and trusted origin.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: incidentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Investigation started
 *       403:
 *         description: Origin not allowed
 *       503:
 *         description: Incident service unavailable
 */
router.post(
  "/:incidentId/investigate",
  trustedOrigin,
  incidentMutationRateLimiter,
  async (req, res) => {
    try {
      const result = await callPython(
        req,
        `/v1/incidents/${encodeURIComponent(req.params.incidentId)}/investigate`,
        { method: "POST", body: {} },
      );
      return res.json(result);
    } catch (error) {
      return sendError(res, error);
    }
  },
);

/**
 * @swagger
 * /api/incidents/{incidentId}/approve:
 *   post:
 *     tags: [Incidents]
 *     summary: Approve incident action
 *     description: Approves an incident remediation action. Stores approval token in Redis. Requires authentication and trusted origin.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: incidentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Action approved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 incident_id:
 *                   type: string
 *                 status:
 *                   type: string
 *                 expires_at:
 *                   type: string
 *                   format: date-time
 *       403:
 *         description: Origin not allowed
 *       502:
 *         description: Invalid approval response
 *       503:
 *         description: Incident service unavailable
 */
router.post(
  "/:incidentId/approve",
  trustedOrigin,
  incidentMutationRateLimiter,
  async (req, res) => {
    const userId = String(req.user._id);
    const incidentId = String(req.params.incidentId);
    const key = approvalKey(userId, incidentId);

    try {
      const result = await callPython(
        req,
        `/v1/incidents/${encodeURIComponent(incidentId)}/approve`,
        { method: "POST", body: {} },
      );

      if (
        typeof result.approval_token !== "string" ||
        typeof result.expires_at !== "string"
      ) {
        return res.status(502).json({
          success: false,
          message: "Incident service returned an invalid approval",
        });
      }

      const ttl = Math.max(
        1,
        Math.min(
          600,
          Math.ceil((Date.parse(result.expires_at) - Date.now()) / 1000),
        ),
      );

      await redis.set(key, result.approval_token, { EX: ttl });

      // Never send the raw approval credential to the browser.
      return res.json({
        incident_id: result.incident_id,
        status: result.status,
        expires_at: result.expires_at,
      });
    } catch (error) {
      return sendError(res, error);
    }
  },
);

/**
 * @swagger
 * /api/incidents/{incidentId}/execute:
 *   post:
 *     tags: [Incidents]
 *     summary: Execute approved action
 *     description: Executes an approved incident remediation action. Consumes the one-time approval token. Requires authentication and trusted origin.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: incidentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Action executed successfully
 *       403:
 *         description: Approval missing, expired, or rejected
 *       503:
 *         description: Incident service unavailable
 */
router.post(
  "/:incidentId/execute",
  trustedOrigin,
  incidentMutationRateLimiter,
  async (req, res) => {
    const userId = String(req.user._id);
    const incidentId = String(req.params.incidentId);
    const key = approvalKey(userId, incidentId);

    try {
      const approvalToken = await redis.get(key);
      if (!approvalToken) {
        return res.status(403).json({
          success: false,
          message: "Approval is missing or expired; approve the action again",
        });
      }

      const result = await callPython(
        req,
        `/v1/incidents/${encodeURIComponent(incidentId)}/execute`,
        {
          method: "POST",
          body: { approval_token: approvalToken },
        },
      );

      // Python independently validates and consumes the one-time approval.
      await redis.del(key);
      return res.json(result);
    } catch (error) {
      // A definitive rejection means Python did not accept this approval.
      // Timeouts and upstream failures remain uncertain; do not infer outcome.
      if ([403, 409].includes(error.status)) {
        try {
          await redis.del(key);
        } catch {
          // Python remains authoritative and will reject consumed approvals.
        }
      }
      return sendError(res, error);
    }
  },
);


/**
 * @swagger
 * /api/incidents/{incidentId}/recover:
 *   post:
 *     tags: [Incidents]
 *     summary: Recover from incident
 *     description: Interrupts incident execution and returns system to normal state. Requires authentication and trusted origin.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: incidentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Recovery initiated
 *       403:
 *         description: Origin not allowed
 *       503:
 *         description: Incident service unavailable
 */
router.post(
  "/:incidentId/recover",
  trustedOrigin,
  incidentMutationRateLimiter,
  async (req, res) => {
    const userId = String(req.user._id);
    const incidentId = String(req.params.incidentId);
    const key = approvalKey(userId, incidentId);

    try {
      const result = await callPython(
        req,
        `/v1/incidents/${encodeURIComponent(incidentId)}/recover`,
        { method: "POST", body: {} },
      );

      // Clear cached approval only after Python confirms recovery.
      if (result.status === "execution_interrupted") {
        try {
          await redis.del(key);
        } catch {
          // Python remains authoritative for approval validity.
        }
      }

      return res.json(result);
    } catch (error) {
      return sendError(res, error);
    }
  },
);

export default router;
