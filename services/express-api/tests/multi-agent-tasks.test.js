import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import router from "../src/routes/ai.route.js";

const USER_ID = "507f1f77bcf86cd799439011";
const TASK_ID = "550e8400-e29b-41d4-a716-446655440000";
const TOKEN = "test-multi-agent-internal-token";

const task = {
  id: TASK_ID,
  status: "queued",
  progress: {},
  result: null,
  error_code: null,
  attempt_count: 0,
  created_at: "2026-10-28T12:00:00Z",
  updated_at: "2026-10-28T12:00:00Z",
  started_at: null,
  finished_at: null,
  lease_token: "must-not-leak",
  worker_id: "internal-worker",
};

const originalFetch = globalThis.fetch;
const originalToken = process.env.PYTHON_AI_INTERNAL_TOKEN;
const originalBaseUrl = process.env.PYTHON_AI_BASE_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) {
    delete process.env.PYTHON_AI_INTERNAL_TOKEN;
  } else {
    process.env.PYTHON_AI_INTERNAL_TOKEN = originalToken;
  }
  if (originalBaseUrl === undefined) {
    delete process.env.PYTHON_AI_BASE_URL;
  } else {
    process.env.PYTHON_AI_BASE_URL = originalBaseUrl;
  }
});

function handlerFor(method, path) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods[method],
  );
  assert.ok(layer, `Expected ${method.toUpperCase()} ${path} route`);
  return layer.route.stack.at(-1).handle;
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function setupUpstream() {
  process.env.PYTHON_AI_INTERNAL_TOKEN = TOKEN;
  process.env.PYTHON_AI_BASE_URL = "http://ai-service.test";
}

function upstreamResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

describe("multi-agent task proxy handlers", () => {
  it("rejects invalid create payloads without contacting Python", async () => {
    setupUpstream();
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return upstreamResponse(201, task);
    };

    const res = responseRecorder();
    await handlerFor("post", "/multi-agent/tasks")(
      {
        user: { _id: USER_ID },
        body: { prompt: " ", unexpected: true },
      },
      res,
    );

    assert.equal(res.statusCode, 400);
    assert.equal(calls, 0);
  });

  it("creates a task for the authenticated user and strips internal fields", async () => {
    setupUpstream();
    let captured;
    globalThis.fetch = async (url, options) => {
      captured = { url, options };
      return upstreamResponse(201, task);
    };

    const res = responseRecorder();
    await handlerFor("post", "/multi-agent/tasks")(
      {
        user: { _id: USER_ID },
        body: { prompt: "  Summarize the conversation  " },
      },
      res,
    );

    assert.equal(res.statusCode, 201);
    assert.equal(captured.url, "http://ai-service.test/v1/multi-agent/tasks");
    assert.equal(captured.options.method, "POST");
    assert.equal(captured.options.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(captured.options.headers["X-Relay-User-Id"], USER_ID);
    assert.deepEqual(JSON.parse(captured.options.body), {
      prompt: "Summarize the conversation",
      max_steps: 8,
      timeout_seconds: 30,
    });
    assert.equal(res.body.id, TASK_ID);
    assert.equal("lease_token" in res.body, false);
    assert.equal("worker_id" in res.body, false);
  });

  it("accepts the 240-second maximum and forwards it to Python", async () => {
    setupUpstream();
    let captured;
    globalThis.fetch = async (url, options) => {
      captured = { url, options };
      return upstreamResponse(201, task);
    };

    const res = responseRecorder();
    await handlerFor("post", "/multi-agent/tasks")(
      {
        user: { _id: USER_ID },
        body: {
          prompt: "Summarize the conversation",
          timeout_seconds: 240,
        },
      },
      res,
    );

    assert.equal(res.statusCode, 201);
    assert.equal(
      JSON.parse(captured.options.body).timeout_seconds,
      240,
    );
  });

  it("rejects timeout values above 240 without contacting Python", async () => {
    setupUpstream();
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return upstreamResponse(201, task);
    };

    const res = responseRecorder();
    await handlerFor("post", "/multi-agent/tasks")(
      {
        user: { _id: USER_ID },
        body: {
          prompt: "Summarize the conversation",
          timeout_seconds: 241,
        },
      },
      res,
    );

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      success: false,
      message: "Invalid multi-agent task payload",
    });
    assert.equal(calls, 0);
  });

  it("lists tasks with pagination and forwards authenticated identity", async () => {
    setupUpstream();
    let captured;
    globalThis.fetch = async (url, options) => {
      captured = { url, options };
      return upstreamResponse(200, [task]);
    };

    const res = responseRecorder();
    await handlerFor("get", "/multi-agent/tasks")(
      {
        user: { _id: USER_ID },
        query: { limit: "10", offset: "20" },
      },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(
      captured.url,
      "http://ai-service.test/v1/multi-agent/tasks?limit=10&offset=20",
    );
    assert.equal(captured.options.headers["X-Relay-User-Id"], USER_ID);
    assert.equal(res.body.length, 1);
    assert.equal("lease_token" in res.body[0], false);
  });

  it("rejects invalid pagination before contacting Python", async () => {
    setupUpstream();
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return upstreamResponse(200, []);
    };

    const res = responseRecorder();
    await handlerFor("get", "/multi-agent/tasks")(
      {
        user: { _id: USER_ID },
        query: { limit: "101", offset: "0" },
      },
      res,
    );

    assert.equal(res.statusCode, 400);
    assert.equal(calls, 0);
  });

  it("gets a task and maps upstream not-found to 404", async () => {
    setupUpstream();
    globalThis.fetch = async () => upstreamResponse(200, task);

    const handler = handlerFor("get", "/multi-agent/tasks/:taskId");
    const res = responseRecorder();
    await handler(
      { user: { _id: USER_ID }, params: { taskId: TASK_ID } },
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.id, TASK_ID);

    globalThis.fetch = async () =>
      upstreamResponse(404, { detail: "Task not found" });
    const missing = responseRecorder();
    await handler(
      { user: { _id: USER_ID }, params: { taskId: TASK_ID } },
      missing,
    );
    assert.equal(missing.statusCode, 404);
    assert.deepEqual(missing.body, {
      success: false,
      message: "Task not found",
    });
  });

  it("rejects malformed task IDs without contacting Python", async () => {
    setupUpstream();
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return upstreamResponse(200, task);
    };

    const res = responseRecorder();
    await handlerFor("get", "/multi-agent/tasks/:taskId")(
      { user: { _id: USER_ID }, params: { taskId: "not-a-uuid" } },
      res,
    );

    assert.equal(res.statusCode, 400);
    assert.equal(calls, 0);
  });

  it("maps upstream timeouts to 504 without leaking internal details", async () => {
    setupUpstream();
    globalThis.fetch = async () => {
      const error = new Error("private upstream details");
      error.name = "AbortError";
      throw error;
    };

    const res = responseRecorder();
    await handlerFor("get", "/multi-agent/tasks")(
      { user: { _id: USER_ID }, query: {} },
      res,
    );

    assert.equal(res.statusCode, 504);
    assert.deepEqual(res.body, {
      success: false,
      message: "AI task service request timed out",
    });
  });

  it("returns a sanitized 503 when the internal token is missing", async () => {
    delete process.env.PYTHON_AI_INTERNAL_TOKEN;
    process.env.PYTHON_AI_BASE_URL = "http://ai-service.test";

    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return upstreamResponse(200, []);
    };

    const res = responseRecorder();
    await handlerFor("get", "/multi-agent/tasks")(
      { user: { _id: USER_ID }, query: {} },
      res,
    );

    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, {
      success: false,
      message: "AI task service is temporarily unavailable",
    });
    assert.equal(calls, 0);
  });

  it("maps upstream network failures to a sanitized 502", async () => {
    setupUpstream();
    globalThis.fetch = async () => {
      throw new Error("private connection details");
    };

    const res = responseRecorder();
    await handlerFor("get", "/multi-agent/tasks")(
      { user: { _id: USER_ID }, query: {} },
      res,
    );

    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.body, {
      success: false,
      message: "AI task service is temporarily unavailable",
    });
    assert.equal(JSON.stringify(res.body).includes("private connection details"), false);
  });

  it("maps an upstream 503 to a sanitized 503", async () => {
    setupUpstream();
    globalThis.fetch = async () =>
      upstreamResponse(503, { detail: "private maintenance details" });

    const res = responseRecorder();
    await handlerFor("get", "/multi-agent/tasks")(
      { user: { _id: USER_ID }, query: {} },
      res,
    );

    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, {
      success: false,
      message: "AI task service is temporarily unavailable",
    });
  });

  it("preserves upstream 503 status for non-JSON error responses", async () => {
    setupUpstream();
    globalThis.fetch = async () => ({
      ok: false,
      status: 503,
      async json() {
        throw new SyntaxError("private plain-text upstream error");
      },
    });

    const res = responseRecorder();
    await handlerFor("get", "/multi-agent/tasks")(
      { user: { _id: USER_ID }, query: {} },
      res,
    );

    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, {
      success: false,
      message: "AI task service is temporarily unavailable",
    });
    assert.equal(
      JSON.stringify(res.body).includes("private plain-text upstream error"),
      false,
    );
  });

  it("maps malformed JSON from a successful upstream response to a sanitized 502", async () => {
    setupUpstream();
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      async json() {
        throw new SyntaxError("private malformed response details");
      },
    });

    const res = responseRecorder();
    await handlerFor("get", "/multi-agent/tasks")(
      { user: { _id: USER_ID }, query: {} },
      res,
    );

    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.body, {
      success: false,
      message: "AI task service is temporarily unavailable",
    });
  });

});
