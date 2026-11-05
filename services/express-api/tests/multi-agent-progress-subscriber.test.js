import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createMultiAgentProgressSubscriber,
  validateMultiAgentProgressEvent,
} from "../src/lib/multi-agent-progress-subscriber.js";

const OWNER = "507f1f77bcf86cd799439011";
const OTHER = "507f191e810c19729de860ea";
const TASK = "550e8400-e29b-41d4-a716-446655440000";
const CHANNEL = "relay:multi-agent:progress:v1";

function validEvent(overrides = {}) {
  return {
    version: 1,
    task_id: TASK,
    relay_user_id: OWNER,
    progress: {
      phase: "executing",
      steps: [{ step_id: "execute", role: "executor", status: "running" }],
    },
    ...overrides,
  };
}

function harness() {
  const sent = [];
  const clients = [];

  const redis = {
    duplicate() {
      const client = {
        isOpen: false,
        isReady: false,
        callback: undefined,
        subscribedChannel: undefined,
        on() {},
        async connect() {
          this.isOpen = true;
          this.isReady = true;
        },
        async subscribe(channel, callback) {
          this.subscribedChannel = channel;
          this.callback = callback;
        },
        async quit() {
          this.isOpen = false;
          this.isReady = false;
        },
      };
      clients.push(client);
      return client;
    },
  };

  const io = {
    to(room) {
      return {
        emit(event, payload) {
          sent.push({ room, event, payload });
        },
      };
    },
  };

  const logger = { warn() {}, error() {} };
  const service = createMultiAgentProgressSubscriber({
    redis,
    io,
    getUserRoom: (id) => `user:${id}`,
    logger,
  });

  return { service, clients, sent };
}

afterEach(() => {});

describe("multi-agent progress subscriber", () => {
  it("accepts the publisher's valid event shape", () => {
    assert.equal(validateMultiAgentProgressEvent(validEvent()), true);
  });

  it("rejects extra fields, invalid versions, IDs and progress shapes", () => {
    assert.equal(validateMultiAgentProgressEvent({ ...validEvent(), secret: "x" }), false);
    assert.equal(validateMultiAgentProgressEvent(validEvent({ version: 2 })), false);
    assert.equal(validateMultiAgentProgressEvent(validEvent({ task_id: "not-a-uuid" })), false);
    assert.equal(validateMultiAgentProgressEvent(validEvent({ relay_user_id: "bad" })), false);
    assert.equal(validateMultiAgentProgressEvent(validEvent({
      progress: { phase: "executing", steps: [], leaked: "x" },
    })), false);
    assert.equal(validateMultiAgentProgressEvent(validEvent({
      progress: { phase: "executing", steps: Array(13).fill({ step_id: "x", role: "executor", status: "running" }) },
    })), false);
  });

  it("rejects invalid or duplicate step IDs and invalid statuses", () => {
    for (const step of [
      { step_id: "Execute", role: "executor", status: "running" },
      { step_id: "bad.step", role: "executor", status: "running" },
      { step_id: "execute", role: "executor", status: "secret" },
    ]) {
      assert.equal(validateMultiAgentProgressEvent(validEvent({
        progress: { phase: "executing", steps: [step] },
      })), false);
    }

    assert.equal(validateMultiAgentProgressEvent(validEvent({
      progress: { phase: "executing", steps: [
        { step_id: "execute", role: "executor", status: "running" },
        { step_id: "execute", role: "reviewer", status: "pending" },
      ] },
    })), false);
  });

  it("uses a dedicated Redis connection and delivers only to the validated owner room", async () => {
    const h = harness();
    await h.service.start();

    assert.equal(h.clients.length, 1);
    assert.equal(h.clients[0].subscribedChannel, CHANNEL);

    h.clients[0].callback(JSON.stringify(validEvent()), CHANNEL);

    assert.deepEqual(h.sent, [{
      room: `user:${OWNER}`,
      event: "multiAgentTaskProgress",
      payload: {
        task_id: TASK,
        progress: validEvent().progress,
      },
    }]);

    assert.notEqual(h.sent[0].room, `user:${OTHER}`);
    await h.service.stop();
    assert.equal(h.clients[0].isOpen, false);
  });

  it("ignores malformed, oversized, wrong-channel and wrong-version events", async () => {
    const h = harness();
    await h.service.start();
    const callback = h.clients[0].callback;

    callback("{", CHANNEL);
    callback("x".repeat(8193), CHANNEL);
    callback(JSON.stringify(validEvent()), "unrelated:channel");
    callback(JSON.stringify(validEvent({ version: 9 })), CHANNEL);

    assert.equal(h.sent.length, 0);
    await h.service.stop();
  });

  it("rejects messages containing extra fields instead of forwarding them", async () => {
    const h = harness();
    await h.service.start();

    h.clients[0].callback(JSON.stringify({
      ...validEvent(),
      prompt: "must not be forwarded",
    }), CHANNEL);

    assert.equal(h.sent.length, 0);
    await h.service.stop();
  });
});
