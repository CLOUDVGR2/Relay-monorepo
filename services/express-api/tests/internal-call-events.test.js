import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createInternalCallEventsRouter } from "../src/routes/internal-call-events.route.js";

const TOKEN = "test-only-call-events-token";
const initiatorId = "507f1f77bcf86cd799439011";
const inviteeId = "507f191e810c19729de860ea";

const event = {
  eventType: "invitation",
  callId: "550e8400-e29b-41d4-a716-446655440000",
  conversationId: "123e4567-e89b-42d3-a456-426614174000",
  initiatorId,
  type: "VIDEO",
  status: "RINGING",
  participantIds: [initiatorId, inviteeId],
  createdAt: "2026-10-24T12:00:00.000Z",
};

let server;
let baseUrl;
let emitted;
let roomCalls;

before(async () => {
  emitted = [];
  roomCalls = [];

  const io = {
    to(room) {
      roomCalls.push(room);

      const target = {
        to(nextRoom) {
          roomCalls.push(nextRoom);
          return target;
        },
        emit(name, payload) {
          emitted.push({ name, payload });
        },
      };

      return target;
    },
  };

  const app = express();
  app.use(
    "/internal",
    createInternalCallEventsRouter({
      io,
      getUserRoom: (userId) => `user:${userId}`,
      getToken: () => TOKEN,
    }),
  );

  server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

async function postEvent(body, token = TOKEN) {
  return fetch(`${baseUrl}/internal/call-events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

describe("internal call-event delivery", () => {
  it("rejects requests with an invalid token", async () => {
    const response = await postEvent(event, "wrong-token");

    assert.equal(response.status, 401);
    assert.equal(emitted.length, 0);
  });

  it("rejects invalid event payloads", async () => {
    const response = await postEvent({ ...event, status: "FORGED" });

    assert.equal(response.status, 400);
    assert.equal(emitted.length, 0);
  });

  it("rejects duplicate or invalid participant IDs", async () => {
    const response = await postEvent({
      ...event,
      participantIds: [initiatorId, initiatorId],
    });

    assert.equal(response.status, 400);
    assert.equal(emitted.length, 0);
  });

  it("delivers a validated event to participant rooms only", async () => {
    const response = await postEvent(event);

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { success: true });
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].name, "callEvent");
    assert.deepEqual(emitted[0].payload, event);
    assert.deepEqual(roomCalls, [
      `user:${initiatorId}`,
      `user:${inviteeId}`,
    ]);
  });
});
