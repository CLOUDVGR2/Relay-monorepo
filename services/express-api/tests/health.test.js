/** Tests for health test in the express api. */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.EXPRESS_TEST_BASE_URL || "http://127.0.0.1:5001";
const allowedOrigin =
  process.env.EXPRESS_TEST_ALLOWED_ORIGIN || "http://localhost:5173";
const deniedOrigin = "https://untrusted-origin.invalid";

let serverAvailable = false;

before(async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/health/live`, {
      signal: AbortSignal.timeout(3000),
    });
    serverAvailable = response.status === 200;
  } catch {
    serverAvailable = false;
  }

  assert.equal(
    serverAvailable,
    true,
    `Express API is unavailable at ${BASE_URL}. Start the backend stack before running these integration tests.`,
  );
});

describe("Express HTTP security and health", () => {
  it("returns a successful liveness response", async () => {
    const response = await fetch(`${BASE_URL}/api/health/live`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(Number.isNaN(Date.parse(body.timestamp)), false);
  });

  it("reports readiness when the database is connected", async () => {
    const response = await fetch(`${BASE_URL}/api/health/ready`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      status: "ready",
      database: "connected",
    });
  });

  it("sets security headers and hides the Express signature", async () => {
    const response = await fetch(`${BASE_URL}/api/health/live`);

    assert.equal(response.headers.get("x-powered-by"), null);
    assert.ok(response.headers.has("x-content-type-options"));
    assert.ok(response.headers.has("x-frame-options"));
  });

  it("allows a configured browser origin with credentials", async () => {
    const response = await fetch(`${BASE_URL}/api/health/live`, {
      headers: { Origin: allowedOrigin },
    });

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      allowedOrigin,
    );
    assert.equal(
      response.headers.get("access-control-allow-credentials"),
      "true",
    );
  });

  it("rejects an untrusted browser origin", async () => {
    const response = await fetch(`${BASE_URL}/api/health/live`, {
      headers: { Origin: deniedOrigin },
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.deepEqual(body, {
      success: false,
      message: "Request origin is not allowed",
    });
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      null,
    );
  });

  it("returns a consistent JSON 404 for unknown API routes", async () => {
    const response = await fetch(
      `${BASE_URL}/api/__integration_test_missing_route__`,
    );
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.deepEqual(body, {
      success: false,
      message: "API endpoint not found",
    });
  });
});
