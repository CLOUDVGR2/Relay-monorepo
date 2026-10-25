import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { io as connectSocket } from "socket.io-client";
import { CallEventsPublisher } from "../../nest-api/dist/conversations/call-events.publisher.js";

const TEST_SECRET =
  "call-events-integration-test-secret-only";
const INTERNAL_TOKEN =
  "call-events-integration-internal-token-only";
const TEST_MONGO_URI =
  "mongodb://127.0.0.1:27018/relay_call_events_integration_test";

let socketModule;
let User;
let baseUrl;
let serverStarted = false;
let testUsers = [];
const clients = [];

function waitForEvent(socket, eventName, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      resolve({ received: false });
    }, timeoutMs);

    function onEvent(payload) {
      clearTimeout(timer);
      resolve({ received: true, payload });
    }

    socket.once(eventName, onEvent);
  });
}

async function connectAuthenticated(userId) {
  const client = connectSocket(baseUrl, {
    auth: {
      token: jwt.sign({ userId }, TEST_SECRET, {
        algorithm: "HS256",
        expiresIn: "2m",
      }),
    },
    transports: ["websocket"],
    reconnection: false,
    timeout: 4000,
  });

  clients.push(client);

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.disconnect();
      reject(new Error("Timed out connecting authenticated test client"));
    }, 5000);

    client.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });

    client.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  return client;
}

async function postCallEvent(event, token = INTERNAL_TOKEN) {
  return fetch(`${baseUrl}/internal/call-events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(event),
  });
}

before(async () => {
  // Set test-only configuration before importing the real socket module.
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = TEST_MONGO_URI;
  process.env.JWT_SECRET = TEST_SECRET;

  await mongoose.connect(TEST_MONGO_URI);

  User = (await import("../src/models/user.model.js")).default;

  socketModule = await import("../src/lib/socket.js");

  const { app, server, io, getUserRoom } = socketModule;
  const { createInternalCallEventsRouter } =
    await import("../src/routes/internal-call-events.route.js");

  const suffix = `${Date.now()}-${process.pid}`;

  testUsers = await User.create([
    {
      email: `call-initiator-${suffix}@example.test`,
      fullName: "Call Test Initiator",
      password: "test-only-password-hash",
    },
    {
      email: `call-invitee-${suffix}@example.test`,
      fullName: "Call Test Invitee",
      password: "test-only-password-hash",
    },
    {
      email: `call-outsider-${suffix}@example.test`,
      fullName: "Call Test Outsider",
      password: "test-only-password-hash",
    },
  ]);

  app.use(
    "/internal",
    createInternalCallEventsRouter({
      io,
      getUserRoom,
      getToken: () => INTERNAL_TOKEN,
    }),
  );

  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once("error", onError);

    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      serverStarted = true;
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  for (const client of clients) {
    client.disconnect();
  }

  if (serverStarted && socketModule) {
    await socketModule.closeSocketServer();
  }

  if (User && testUsers.length) {
    await User.deleteMany({
      _id: { $in: testUsers.map((user) => user._id) },
    });
  }

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});

describe("real Socket.IO call-event integration", () => {
  it("delivers events to authenticated participants, not outsiders", async () => {
    const [initiator, invitee, outsider] = testUsers.map((user) =>
      user._id.toString(),
    );

    const initiatorSocket = await connectAuthenticated(initiator);
    const inviteeSocket = await connectAuthenticated(invitee);
    const outsiderSocket = await connectAuthenticated(outsider);

    const event = {
      eventType: "invitation",
      callId: "550e8400-e29b-41d4-a716-446655440000",
      conversationId: "123e4567-e89b-42d3-a456-426614174000",
      initiatorId: initiator,
      type: "VIDEO",
      status: "RINGING",
      participantIds: [initiator, invitee],
      createdAt: new Date().toISOString(),
    };

    // Install listeners before sending the HTTP request.
    const initiatorEvent = waitForEvent(
      initiatorSocket,
      "callEvent",
    );
    const inviteeEvent = waitForEvent(
      inviteeSocket,
      "callEvent",
    );

    let outsiderReceivedEvent = false;
    const onOutsiderEvent = () => {
      outsiderReceivedEvent = true;
    };
    outsiderSocket.on("callEvent", onOutsiderEvent);

    const response = await postCallEvent(event);

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { success: true });

    const [initiatorResult, inviteeResult] = await Promise.all([
      initiatorEvent,
      inviteeEvent,
    ]);

    assert.equal(initiatorResult.received, true);
    assert.equal(inviteeResult.received, true);
    assert.deepEqual(initiatorResult.payload, event);
    assert.deepEqual(inviteeResult.payload, event);

    // Give any unintended delivery a short opportunity to arrive.
    await new Promise((resolve) => setTimeout(resolve, 250));
    outsiderSocket.off("callEvent", onOutsiderEvent);

    assert.equal(
      outsiderReceivedEvent,
      false,
      "A nonparticipant must not receive the call event",
    );
  });

  it("delivers events through the real Nest publisher and Express socket server", async () => {
    const [initiator, invitee, outsider] = testUsers.map((user) =>
      user._id.toString(),
    );

    const initiatorSocket = await connectAuthenticated(initiator);
    const inviteeSocket = await connectAuthenticated(invitee);
    const outsiderSocket = await connectAuthenticated(outsider);

    const event = {
      eventType: "invitation",
      callId: "550e8400-e29b-41d4-a716-446655440002",
      conversationId: "123e4567-e89b-42d3-a456-426614174000",
      initiatorId: initiator,
      type: "VIDEO",
      status: "RINGING",
      participantIds: [initiator, invitee],
      createdAt: new Date().toISOString(),
    };

    const config = {
      get(name) {
        if (name === "CALL_EVENTS_BASE_URL") return baseUrl;
        if (name === "CALL_EVENTS_INTERNAL_TOKEN") return INTERNAL_TOKEN;
        return undefined;
      },
    };

    const publisher = new CallEventsPublisher(config);

    const initiatorEvent = waitForEvent(initiatorSocket, "callEvent");
    const inviteeEvent = waitForEvent(inviteeSocket, "callEvent");

    let outsiderReceivedEvent = false;
    const onOutsiderEvent = () => {
      outsiderReceivedEvent = true;
    };
    outsiderSocket.on("callEvent", onOutsiderEvent);

    await publisher.publish(event);

    const [initiatorResult, inviteeResult] = await Promise.all([
      initiatorEvent,
      inviteeEvent,
    ]);

    assert.equal(initiatorResult.received, true);
    assert.equal(inviteeResult.received, true);
    assert.deepEqual(initiatorResult.payload, event);
    assert.deepEqual(inviteeResult.payload, event);

    await new Promise((resolve) => setTimeout(resolve, 250));
    outsiderSocket.off("callEvent", onOutsiderEvent);

    assert.equal(
      outsiderReceivedEvent,
      false,
      "A nonparticipant must not receive the call event",
    );
  });

  it("rejects invalid internal tokens without broadcasting", async () => {
    const [initiator, invitee] = testUsers.map((user) =>
      user._id.toString(),
    );

    const initiatorSocket = await connectAuthenticated(initiator);
    const inviteeSocket = await connectAuthenticated(invitee);

    const event = {
      eventType: "invitation",
      callId: "550e8400-e29b-41d4-a716-446655440001",
      conversationId: "123e4567-e89b-42d3-a456-426614174000",
      initiatorId: initiator,
      type: "AUDIO",
      status: "RINGING",
      participantIds: [initiator, invitee],
      createdAt: new Date().toISOString(),
    };

    const initiatorEvent = waitForEvent(
      initiatorSocket,
      "callEvent",
      300,
    );
    const inviteeEvent = waitForEvent(
      inviteeSocket,
      "callEvent",
      300,
    );

    const response = await postCallEvent(event, "wrong-test-token");

    assert.equal(response.status, 401);

    const [initiatorResult, inviteeResult] = await Promise.all([
      initiatorEvent,
      inviteeEvent,
    ]);

    assert.equal(initiatorResult.received, false);
    assert.equal(inviteeResult.received, false);
  });
});
