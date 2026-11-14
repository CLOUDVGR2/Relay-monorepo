/** HTTP route handlers for ai route in the Relay Express API. */

import express from "express";
import AiExecution from "../models/ai-execution.model.js";
import User from "../models/user.model.js";

import { protectRoute } from "../middleware/auth.middleware.js";
import {
  aiAnswerRateLimiter,
  aiDocumentIngestionRateLimiter,
} from "../middleware/rate-limit.middleware.js";

const router = express.Router();
const MAX_QUESTION_LENGTH = 2000;

function trustedOrigin(req, res, next) {
  const allowedOrigins = (
    process.env.CLIENT_URL ||
    "http://localhost:5173,http://localhost:5174"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const origin = req.get("origin");

  // Same-origin browser GET requests may omit the Origin header.
  // Allow that case only when Fetch Metadata confirms same-origin.
  if (
    !origin &&
    req.method === "GET" &&
    req.get("sec-fetch-site") === "same-origin"
  ) {
    return next();
  }

  // Native clients do not send browser Origin headers. Permit that transport
  // only when protectRoute has an explicit bearer credential; browser cookie
  // requests must still pass the configured origin policy.
  const hasBearerCredential = /^Bearer\s+\S+$/i.test(
    req.get("authorization") || "",
  );
  if (hasBearerCredential) {
    return next();
  }

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
      : "http://127.0.0.1:8000")
  ).replace(/\/+$/, "");
}

async function requestGroundedAnswer(req, question, topK) {
  const token = process.env.PYTHON_AI_INTERNAL_TOKEN;

  if (!token) {
    const error = new Error("AI service is not configured");
    error.status = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(
      `${getPythonBaseUrl()}/v1/documents/answer`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Relay-User-Id": String(req.user._id),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          question,
          top_k: topK,
        }),
        signal: controller.signal,
      },
    );

    let data;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const status = [400, 422, 429].includes(response.status)
        ? response.status === 422 ? 400 : response.status
        : response.status === 503 ? 503 : 502;

      const error = new Error(
        status === 400
          ? "Invalid AI answer request"
          : status === 429
            ? "Too many requests. Please try again later."
            : status === 503
              ? "AI service is temporarily unavailable"
              : "AI service is temporarily unavailable",
      );

      error.status = status;
      throw error;
    }

    if (
      !data ||
      typeof data.answer !== "string" ||
      !Array.isArray(data.citations)
    ) {
      const error = new Error("AI service returned an invalid response");
      error.status = 502;
      throw error;
    }

    const uploaderIds = [...new Set(
      data.citations
        .map((citation) => citation?.uploaded_by_id)
        .filter(
          (id) =>
            typeof id === "string" &&
            /^[0-9a-f]{24}$/i.test(id),
        ),
    )];

    let uploadedBy = [];

    if (uploaderIds.length > 0) {
      try {
        const uploaderUsers = await User.find({
          _id: { $in: uploaderIds },
        })
          .select("_id fullName")
          .lean()
          .exec();

        const namesById = new Map(
          uploaderUsers.map((user) => [
            String(user._id),
            user.fullName,
          ]),
        );

        uploadedBy = [...new Set(
          uploaderIds
            .map((id) => namesById.get(id))
            .filter(
              (name) =>
                typeof name === "string" && name.trim().length > 0,
            ),
        )];
      } catch (lookupError) {
        // Attribution must not make an otherwise valid grounded answer fail.
        console.warn(
          "[ai-answer] Uploader attribution lookup failed:",
          lookupError.message,
        );
      }
    }

    const publicCitations = data.citations.map((citation) => {
      const publicCitation = { ...citation };
      delete publicCitation.uploaded_by_id;
      return publicCitation;
    });

    return {
      answer: data.answer,
      uploaded_by: uploadedBy,
      citations: publicCitations,
    };
  } catch (error) {
    if (error.status) {
      throw error;
    }

    if (error.name === "AbortError") {
      const timeoutError = new Error("AI answer request timed out");
      timeoutError.status = 504;
      throw timeoutError;
    }

    const upstreamError = new Error(
      "AI service is temporarily unavailable",
    );
    upstreamError.status = 502;
    throw upstreamError;
  } finally {
    clearTimeout(timeout);
  }
}

async function ingestKnowledgeDocument(req, document) {
  const token = process.env.PYTHON_AI_INTERNAL_TOKEN;

  if (!token) {
    const error = new Error("AI service is not configured");
    error.status = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(`${getPythonBaseUrl()}/v1/documents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Relay-User-Id": String(req.user._id),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(document),
      signal: controller.signal,
    });

    let data;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const status = [400, 422, 429].includes(response.status)
        ? response.status === 422 ? 400 : response.status
        : response.status === 503 ? 503 : 502;

      const error = new Error(
        status === 400
          ? "Invalid knowledge document"
          : status === 429
            ? "Too many requests. Please try again later."
            : "AI service is temporarily unavailable",
      );
      error.status = status;
      throw error;
    }

    if (
      !data ||
      typeof data.id !== "string" ||
      typeof data.title !== "string"
    ) {
      const error = new Error("AI service returned an invalid document response");
      error.status = 502;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.status) throw error;

    if (error.name === "AbortError") {
      const timeoutError = new Error("Document ingestion timed out");
      timeoutError.status = 504;
      throw timeoutError;
    }

    const upstreamError = new Error("AI service is temporarily unavailable");
    upstreamError.status = 502;
    throw upstreamError;
  } finally {
    clearTimeout(timeout);
  }
}

router.use(protectRoute);

/**
 * @swagger
 * /api/ai/documents:
 *   post:
 *     tags: [AI]
 *     summary: Ingest knowledge document
 *     description: Ingests a document into the RAG knowledge base for AI-powered search and answering. Requires authentication and trusted origin.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 500
 *                 description: Document title
 *                 example: "System Architecture Guide"
 *               content:
 *                 type: string
 *                 maxLength: 1000000
 *                 description: Document content (max 1MB)
 *                 example: "This document describes the system architecture..."
 *               source_uri:
 *                 type: string
 *                 nullable: true
 *                 maxLength: 2048
 *                 description: Optional source URI for the document
 *                 example: "https://docs.example.com/architecture"
 *     responses:
 *       201:
 *         description: Document ingested successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 title:
 *                   type: string
 *       400:
 *         description: Invalid document data
 *       403:
 *         description: Origin not allowed
 *       429:
 *         description: Rate limit exceeded
 *       503:
 *         description: AI service unavailable
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       502:
 *         description: Knowledge service unavailable or returned an invalid response
 *       504:
 *         description: Knowledge document ingestion timed out
 */
router.post(
  "/documents",
  trustedOrigin,
  aiDocumentIngestionRateLimiter,
  async (req, res) => {
    const title =
      typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const content =
      typeof req.body?.content === "string" ? req.body.content : "";
    const sourceUri =
      req.body?.source_uri === undefined || req.body?.source_uri === null
        ? null
        : typeof req.body.source_uri === "string"
          ? req.body.source_uri.trim()
          : undefined;

    if (
      !title ||
      title.length > 500 ||
      !content.trim() ||
      content.length > 1000000 ||
      sourceUri === undefined ||
      (sourceUri !== null && sourceUri.length > 2048)
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide a valid title, content, and optional source_uri",
      });
    }

    try {
      const document = {
        title,
        content,
        ...(sourceUri === null ? {} : { source_uri: sourceUri }),
      };
      const result = await ingestKnowledgeDocument(req, document);
      return res.status(201).json(result);
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 502;
      return res.status(status).json({
        success: false,
        message: error.message || "AI service is temporarily unavailable",
      });
    }
  },
);

/**
 * @swagger
 * /api/ai/answer:
 *   post:
 *     tags: [AI]
 *     summary: Ask AI a question
 *     description: Asks a question to the AI, which searches the knowledge base and provides a grounded answer with citations. Requires authentication and trusted origin.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - question
 *             properties:
 *               question:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 2000
 *                 description: Question to ask the AI
 *                 example: "How does the authentication system work?"
 *               top_k:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 20
 *                 default: 5
 *                 description: Number of top citations to retrieve
 *                 example: 5
 *     responses:
 *       200:
 *         description: AI answer with citations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answer:
 *                   type: string
 *                   description: AI-generated answer
 *                 citations:
 *                   type: array
 *                   description: Supporting document citations
 *                   items:
 *                     type: object
 *       400:
 *         description: Invalid question or parameters
 *       403:
 *         description: Origin not allowed
 *       429:
 *         description: Rate limit exceeded
 *       504:
 *         description: AI request timeout
 *       503:
 *         description: AI service unavailable
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       502:
 *         description: AI service unavailable or returned an invalid response
 */
router.post(
  "/answer",
  trustedOrigin,
  aiAnswerRateLimiter,
  async (req, res) => {
    const question =
      typeof req.body?.question === "string"
        ? req.body.question.trim()
        : "";

    const topK = req.body?.top_k ?? 5;

    if (
      !question ||
      question.length > MAX_QUESTION_LENGTH ||
      !Number.isInteger(topK) ||
      topK < 1 ||
      topK > 20
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide a valid question and top_k between 1 and 20",
      });
    }

    const startedAt = new Date();
    let execution = null;

    try {
      execution = await AiExecution.create({
        userId: req.user._id,
        operation: "answer",
        status: "running",
        startedAt,
      });
    } catch (historyError) {
      console.error("[ai-runs] Could not create execution record:", historyError.message);
    }

    try {
      const result = await requestGroundedAnswer(req, question, topK);

      if (execution) {
        try {
          await AiExecution.updateOne(
            { _id: execution._id, userId: req.user._id },
            {
              $set: {
                status: "succeeded",
                completedAt: new Date(),
                durationMs: Math.max(0, Date.now() - startedAt.getTime()),
                errorCategory: null,
              },
            },
          );
        } catch (historyError) {
          console.error("[ai-runs] Could not complete execution record:", historyError.message);
        }
      }

      return res.status(200).json(result);
    } catch (error) {
      const status = Number.isInteger(error.status)
        ? error.status
        : 502;

      if (execution) {
        const errorCategory =
          error.name === "AbortError" || status === 504
            ? "timeout"
            : status === 503
              ? "service_unavailable"
              : status >= 500
                ? "upstream_error"
                : "internal_error";

        try {
          await AiExecution.updateOne(
            { _id: execution._id, userId: req.user._id },
            {
              $set: {
                status: "failed",
                completedAt: new Date(),
                durationMs: Math.max(0, Date.now() - startedAt.getTime()),
                errorCategory,
              },
            },
          );
        } catch (historyError) {
          console.error("[ai-runs] Could not record execution failure:", historyError.message);
        }
      }

      return res.status(status).json({
        success: false,
        message: error.message || "AI service is temporarily unavailable",
      });
    }
  },
);


/**
 * Returns recent AI answer executions belonging to the authenticated user.
 * Prompts, generated answers, and raw exception messages are not stored.
 */

/**
 * List knowledge documents belonging to the authenticated user.
 * The internal Python service token is never returned to the client.
 */
/**
 * @swagger
 * /api/ai/documents:
 *   get:
 *     tags: [AI]
 *     summary: List knowledge documents
 *     description: Lists knowledge documents belonging to the authenticated user's tenant.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Documents retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 documents:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Invalid upstream request
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Origin not allowed
 *       502:
 *         description: Knowledge service unavailable or returned an invalid response
 *       503:
 *         description: Knowledge service is not configured
 *       504:
 *         description: Knowledge service request timed out
 */
router.get("/documents", trustedOrigin, async (req, res) => {
  const token = process.env.PYTHON_AI_INTERNAL_TOKEN;

  if (!token) {
    return res.status(503).json({
      success: false,
      message: "Knowledge service is not configured",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(
      `${getPythonBaseUrl()}/v1/documents?limit=50&offset=0`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Relay-User-Id": String(req.user._id),
          Accept: "application/json",
        },
        signal: controller.signal,
      },
    );

    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      return res.status(
        response.status === 429 ? 503 :
          [400, 422].includes(response.status) ? 400 : 502,
      ).json({
        success: false,
        message: "Knowledge documents are temporarily unavailable",
      });
    }

    if (!Array.isArray(data)) {
      return res.status(502).json({
        success: false,
        message: "Knowledge service returned an invalid document list",
      });
    }

    return res.status(200).json({ documents: data });
  } catch (error) {
    return res.status(error.name === "AbortError" ? 504 : 502).json({
      success: false,
      message: "Knowledge documents are temporarily unavailable",
    });
  } finally {
    clearTimeout(timeout);
  }
});

/**
 * Search indexed document chunks within the authenticated user's tenant.
 */
/**
 * @swagger
 * /api/ai/documents/search:
 *   post:
 *     tags: [AI]
 *     summary: Search knowledge documents
 *     description: Searches indexed document chunks belonging to the authenticated user's tenant.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [query]
 *             properties:
 *               query:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 2000
 *                 example: "How does authentication work?"
 *               top_k:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 20
 *                 default: 5
 *     responses:
 *       200:
 *         description: Matching document chunks returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 query:
 *                   type: string
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Invalid search query or top_k
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Origin not allowed
 *       502:
 *         description: Knowledge service unavailable or returned an invalid response
 *       503:
 *         description: Knowledge service is not configured
 *       504:
 *         description: Knowledge search timed out
 */
router.post("/documents/search", trustedOrigin, async (req, res) => {

  const query =
    typeof req.body?.query === "string" ? req.body.query.trim() : "";
  const topK = req.body?.top_k === undefined ? 5 : req.body.top_k;

  if (!query || query.length > 2000 ||
      !Number.isInteger(topK) || topK < 1 || topK > 20) {
    return res.status(400).json({
      success: false,
      message: "Provide a query of 1–2000 characters and top_k from 1 to 20",
    });
  }

  const token = process.env.PYTHON_AI_INTERNAL_TOKEN;
  if (!token) {
    return res.status(503).json({
      success: false,
      message: "Knowledge service is not configured",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(
      `${getPythonBaseUrl()}/v1/documents/search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Relay-User-Id": String(req.user._id),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ query, top_k: topK }),
        signal: controller.signal,
      },
    );

    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const status = [400, 422].includes(response.status) ? 400 :
        response.status === 429 ? 503 : 502;

      return res.status(status).json({
        success: false,
        message: status === 400
          ? "Invalid document search request"
          : "Knowledge search is temporarily unavailable",
      });
    }

    if (!data || typeof data.query !== "string" ||
        !Array.isArray(data.results)) {
      return res.status(502).json({
        success: false,
        message: "Knowledge service returned an invalid search response",
      });
    }

    return res.status(200).json({
      query: data.query,
      results: data.results,
    });
  } catch (error) {
    return res.status(error.name === "AbortError" ? 504 : 502).json({
      success: false,
      message: "Knowledge search is temporarily unavailable",
    });
  } finally {
    clearTimeout(timeout);
  }
});


const MULTI_AGENT_TASK_TIMEOUT_MS = 10_000;
const MULTI_AGENT_TASK_STATUSES = new Set([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toPublicTask(task) {
  if (
    !isRecord(task) ||
    typeof task.id !== "string" ||
    !MULTI_AGENT_TASK_STATUSES.has(task.status) ||
    !isRecord(task.progress) ||
    !(task.result === null || isRecord(task.result)) ||
    !(task.error_code === null || typeof task.error_code === "string") ||
    !Number.isInteger(task.attempt_count) ||
    typeof task.created_at !== "string" ||
    typeof task.updated_at !== "string" ||
    !(task.started_at === null || typeof task.started_at === "string") ||
    !(task.finished_at === null || typeof task.finished_at === "string")
  ) {
    return null;
  }

  return {
    id: task.id,
    status: task.status,
    progress: task.progress,
    result: task.result,
    error_code: task.error_code,
    attempt_count: task.attempt_count,
    created_at: task.created_at,
    updated_at: task.updated_at,
    started_at: task.started_at,
    finished_at: task.finished_at,
  };
}

async function requestMultiAgentTask(req, { method, path, body }) {
  const token = process.env.PYTHON_AI_INTERNAL_TOKEN;
  if (!token) {
    const error = new Error("AI service is not configured");
    error.status = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    MULTI_AGENT_TASK_TIMEOUT_MS,
  );

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

    if (!response.ok) {
      const status =
        response.status === 404
          ? 404
          : [400, 422].includes(response.status)
            ? 400
            : response.status === 429
              ? 429
              : response.status === 503
                ? 503
                : 502;

      const error = new Error("AI task service request failed");
      error.status = status;
      throw error;
    }

    try {
      return await response.json();
    } catch {
      const error = new Error("Invalid AI task service response");
      error.status = 502;
      throw error;
    }
  } catch (error) {
    if (error.status) throw error;

    const upstreamError = new Error("AI task service is unavailable");
    upstreamError.status = error.name === "AbortError" ? 504 : 502;
    throw upstreamError;
  } finally {
    clearTimeout(timeout);
  }
}

function sendMultiAgentTaskError(res, error) {
  const status = error.status || 502;
  const messages = {
    400: "Invalid multi-agent task request",
    404: "Task not found",
    429: "Too many requests. Please try again later.",
    502: "AI task service is temporarily unavailable",
    503: "AI task service is temporarily unavailable",
    504: "AI task service request timed out",
  };

  return res.status(status).json({
    success: false,
    message: messages[status] || messages[502],
  });
}

/**
 * @swagger
 * /api/ai/multi-agent/tasks:
 *   post:
 *     tags: [AI]
 *     summary: Create a multi-agent task
 *     description: Submits a task to the multi-agent service for asynchronous processing.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [prompt]
 *             additionalProperties: false
 *             properties:
 *               prompt:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 4000
 *               max_steps:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 12
 *                 default: 8
 *               timeout_seconds:
 *                 type: number
 *                 exclusiveMinimum: 0
 *                 maximum: 240
 *                 default: 30
 *     responses:
 *       201:
 *         description: Task accepted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MultiAgentTask'
 *       400:
 *         description: Invalid task payload
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Origin not allowed
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       502:
 *         description: AI task service unavailable or returned an invalid response
 *       503:
 *         description: AI task service is not configured
 *       504:
 *         description: AI task service request timed out
 *       404:
 *         description: AI task service resource not found
 */
router.post(
  "/multi-agent/tasks",
  trustedOrigin,
  aiAnswerRateLimiter,
  async (req, res) => {
    const payload = req.body;
    if (!isRecord(payload)) {
      return res.status(400).json({
        success: false,
        message: "Provide a valid multi-agent task payload",
      });
    }

    const allowedKeys = new Set(["prompt", "max_steps", "timeout_seconds"]);
    const hasUnknownKey = Object.keys(payload).some(
      (key) => !allowedKeys.has(key),
    );
    const prompt =
      typeof payload.prompt === "string" ? payload.prompt.trim() : "";
    const maxSteps = payload.max_steps ?? 8;
    const timeoutSeconds = payload.timeout_seconds ?? 30;

    if (
      hasUnknownKey ||
      prompt.length < 1 ||
      prompt.length > 4000 ||
      !Number.isInteger(maxSteps) ||
      maxSteps < 1 ||
      maxSteps > 12 ||
      typeof timeoutSeconds !== "number" ||
      !Number.isFinite(timeoutSeconds) ||
      timeoutSeconds <= 0 ||
      timeoutSeconds > 240
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid multi-agent task payload",
      });
    }

    try {
      const data = await requestMultiAgentTask(req, {
        method: "POST",
        path: "/v1/multi-agent/tasks",
        body: {
          prompt,
          max_steps: maxSteps,
          timeout_seconds: timeoutSeconds,
        },
      });
      const task = toPublicTask(data);

      if (!task) {
        return res.status(502).json({
          success: false,
          message: "AI task service returned an invalid response",
        });
      }

      return res.status(201).json(task);
    } catch (error) {
      return sendMultiAgentTaskError(res, error);
    }
  },
);

/**
 * @swagger
 * /api/ai/multi-agent/tasks:
 *   get:
 *     tags: [AI]
 *     summary: List multi-agent tasks
 *     description: Lists multi-agent tasks for the authenticated user.
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
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *     responses:
 *       200:
 *         description: Task list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MultiAgentTask'
 *       400:
 *         description: Invalid limit or offset
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Origin not allowed
 *       404:
 *         description: Task service resource not found
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       502:
 *         description: AI task service unavailable or returned an invalid response
 *       503:
 *         description: AI task service is not configured
 *       504:
 *         description: AI task service request timed out
 */
router.get("/multi-agent/tasks", trustedOrigin, async (req, res) => {
  const limitRaw = req.query.limit;
  const offsetRaw = req.query.offset;
  const limit = limitRaw === undefined ? 20 : Number(limitRaw);
  const offset = offsetRaw === undefined ? 0 : Number(offsetRaw);

  if (
    (limitRaw !== undefined &&
      (typeof limitRaw !== "string" || !/^\d+$/.test(limitRaw))) ||
    (offsetRaw !== undefined &&
      (typeof offsetRaw !== "string" || !/^\d+$/.test(offsetRaw))) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0
  ) {
    return res.status(400).json({
      success: false,
      message: "Provide limit from 1–100 and a non-negative offset",
    });
  }

  try {
    const query = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    const data = await requestMultiAgentTask(req, {
      method: "GET",
      path: `/v1/multi-agent/tasks?${query.toString()}`,
    });

    if (!Array.isArray(data)) {
      return res.status(502).json({
        success: false,
        message: "AI task service returned an invalid response",
      });
    }

    const tasks = data.map(toPublicTask);
    if (tasks.some((task) => task === null)) {
      return res.status(502).json({
        success: false,
        message: "AI task service returned an invalid response",
      });
    }

    return res.status(200).json(tasks);
  } catch (error) {
    return sendMultiAgentTaskError(res, error);
  }
});

/**
 * @swagger
 * /api/ai/multi-agent/tasks/{taskId}:
 *   get:
 *     tags: [AI]
 *     summary: Get a multi-agent task
 *     description: Retrieves the public status and result of a task.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Task retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MultiAgentTask'
 *       400:
 *         description: Invalid task ID
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Origin not allowed
 *       404:
 *         description: Task not found
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       502:
 *         description: AI task service unavailable or returned an invalid response
 *       503:
 *         description: AI task service is not configured
 *       504:
 *         description: AI task service request timed out
 */
router.get("/multi-agent/tasks/:taskId", trustedOrigin, async (req, res) => {
  const { taskId } = req.params;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      taskId,
    )
  ) {
    return res.status(400).json({
      success: false,
      message: "Provide a valid task ID",
    });
  }

  try {
    const data = await requestMultiAgentTask(req, {
      method: "GET",
      path: `/v1/multi-agent/tasks/${encodeURIComponent(taskId)}`,
    });
    const task = toPublicTask(data);

    if (!task) {
      return res.status(502).json({
        success: false,
        message: "AI task service returned an invalid response",
      });
    }

    return res.status(200).json(task);
  } catch (error) {
    return sendMultiAgentTaskError(res, error);
  }
});

/**
 * @swagger
 * /api/ai/runs:
 *   get:
 *     tags: [AI]
 *     summary: List AI execution history
 *     description: Returns recent AI answer executions belonging to the authenticated user. Prompts, generated answers, and raw exception messages are not stored.
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
 *     responses:
 *       200:
 *         description: Execution history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 runs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       operation:
 *                         type: string
 *                       status:
 *                         type: string
 *                       startedAt:
 *                         type: string
 *                         format: date-time
 *                       completedAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       durationMs:
 *                         type: number
 *                         nullable: true
 *                       errorCategory:
 *                         type: string
 *                         nullable: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Origin not allowed
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get("/runs", trustedOrigin, async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(100, Math.max(1, requestedLimit))
    : 50;

  try {
    const runs = await AiExecution.find({ userId: req.user._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .select("_id operation status startedAt completedAt durationMs errorCategory createdAt")
      .lean()
      .exec();

    return res.status(200).json({ runs });
  } catch (error) {
    console.error("[ai-runs] Could not load execution history:", error.message);
    return res.status(500).json({
      success: false,
      message: "AI execution history is temporarily unavailable",
    });
  }
});


/**
 * Returns authenticated Python AI service telemetry.
 * The internal service token never leaves the Express backend.
 */
/**
 * @swagger
 * /api/ai/metrics:
 *   get:
 *     tags: [AI]
 *     summary: Get AI service metrics
 *     description: Returns authenticated, process-local telemetry from the Python AI service. Internal service credentials are never exposed.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: AI telemetry retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [scope, metrics]
 *               properties:
 *                 scope:
 *                   type: string
 *                   enum: [process_local]
 *                 metrics:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Origin not allowed
 *       502:
 *         description: AI telemetry service unavailable or returned an invalid response
 *       503:
 *         description: AI telemetry is not configured
 *       504:
 *         description: AI telemetry request timed out
 */
router.get("/metrics", trustedOrigin, async (_req, res) => {
  const token = process.env.PYTHON_AI_INTERNAL_TOKEN;

  if (!token) {
    return res.status(503).json({
      success: false,
      message: "AI telemetry is not configured",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(
      `${getPythonBaseUrl()}/internal/metrics`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      },
    );

    let payload;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      return res.status(response.status === 429 ? 503 : 502).json({
        success: false,
        message: "AI telemetry is temporarily unavailable",
      });
    }

    if (
      !payload ||
      payload.scope !== "process_local" ||
      !Array.isArray(payload.metrics)
    ) {
      return res.status(502).json({
        success: false,
        message: "AI telemetry returned an invalid response",
      });
    }

    return res.status(200).json(payload);
  } catch (error) {
    return res.status(error.name === "AbortError" ? 504 : 502).json({
      success: false,
      message: "AI telemetry is temporarily unavailable",
    });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
