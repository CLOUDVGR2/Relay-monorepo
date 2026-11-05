import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCallSignalingRelay } from "../src/lib/call-signaling.js";

const CALL_ID = "550e8400-e29b-41d4-a716-446655440000";
const SECOND_CALL_ID = "650e8400-e29b-41d4-a716-446655440001";
const ALICE = "507f1f77bcf86cd799439011";
const BOB = "507f191e810c19729de860ea";
const MALLORY = "507f1f77bcf86cd799439012";

const TOKEN = "test-only-signaling-token";

function createHarness({
  authorize,
  clock = () => Date.now(),
  baseUrl = "http://nest-api:3000",
  token = TOKEN,
  maxSessions = 500,
  reauthorizationIntervalMs = 0,
  freshnessIntervalMs = 0,
} = {}) {
  const sent = [];
  const handlers = new Map();
  const sockets = new Map();

  const io = {
    to(socketId) {
      return {
        emit(event, payload) {
          sent.push({ socketId, event, payload });
        },
      };
    },
  };

  function makeSocket(id, userId) {
    const socket = {
      id,
      connected: true,
      data: { userId },
      on(event, handler) {
        const key = `${id}:${event}`;
        handlers.set(key, handler);
      },
      emit(event, payload) {
        sent.push({ socketId: id, event, payload });
      },
      disconnect() {
        socket.connected = false;
      },
    };

    sockets.set(id, socket);
    return socket;
  }

  const relay = createCallSignalingRelay({
    io,
    now: clock,
    freshnessIntervalMs,
    getBaseUrl: () => baseUrl,
    getToken: () => token,
    maxSessions,
    reauthorizationIntervalMs,
    fetchImpl: authorize
      ? authorize
      : async (_url, options) => {
          const input = JSON.parse(options.body);

          return {
            ok: true,
            async json() {
              return {
                callId: input.callId,
                peerId: input.actorId.toLowerCase() === ALICE ? BOB : ALICE,
                type: "AUDIO",
                recordingAuthorized: true,
              };
            },
          };
        },
  });

  function connect(id, userId) {
    const socket = makeSocket(id, userId);
    relay.attach(socket);
    return socket;
  }

  async function trigger(socket, event, payload) {
    const handler = handlers.get(`${socket.id}:${event}`);
    assert.ok(handler, `Expected handler for ${event}`);
    await handler(payload);
  }

  function eventsFor(socketId, event) {
    return sent.filter(
      (entry) =>
        entry.socketId === socketId &&
        (!event || entry.event === event),
    );
  }

  afterEach(() => relay.close());

  return {
    relay,
    sent,
    sockets,
    connect,
    trigger,
    eventsFor,
  };
}

describe("call signaling relay", () => {
  it("rejects a video authorization response", async () => {
    const h = createHarness({
      authorize: async (_url, options) => {
        const input = JSON.parse(options.body);
        return {
          ok: true,
          async json() {
            return {
              callId: input.callId,
              peerId: input.actorId.toLowerCase() === ALICE ? BOB : ALICE,
              type: "VIDEO",
            };
          },
        };
      },
    });
    const alice = h.connect("socket-alice", ALICE);

    await h.trigger(alice, "call:join", { callId: CALL_ID });

    assert.equal(h.eventsFor(alice.id, "call:joined").length, 0);
    assert.equal(
      h.eventsFor(alice.id, "call:error").at(-1)?.payload.code,
      "authorization_unavailable",
    );
  });

  it("authorizes the caller before joining a session", async () => {
    const h = createHarness();
    const alice = h.connect("socket-alice", ALICE);

    await h.trigger(alice, "call:join", { callId: CALL_ID });

    assert.equal(h.eventsFor(alice.id, "call:joined").length, 1);
    assert.deepEqual(h.eventsFor(alice.id, "call:joined")[0].payload, {
      callId: CALL_ID,
      type: "AUDIO",
      peerConnected: false,
      recordingAuthorized: true,
    });
  });

  it("updates recording authorization when the second participant joins", async () => {
    let recordingAuthorized = false;

    const h = createHarness({
      authorize: async (_url, options) => {
        const input = JSON.parse(options.body);

        return {
          ok: true,
          async json() {
            return {
              callId: input.callId,
              peerId: input.actorId.toLowerCase() === ALICE ? BOB : ALICE,
              type: "AUDIO",
              recordingAuthorized,
            };
          },
        };
      },
    });

    const alice = h.connect("socket-alice", ALICE);
    const bob = h.connect("socket-bob", BOB);

    await h.trigger(alice, "call:join", { callId: CALL_ID });

    assert.equal(
      h.eventsFor(alice.id, "call:joined")[0].payload.recordingAuthorized,
      false,
    );

    recordingAuthorized = true;

    await h.trigger(bob, "call:join", { callId: CALL_ID });

    assert.equal(
      h.eventsFor(bob.id, "call:joined")[0].payload.recordingAuthorized,
      true,
    );

    const expected = [{
      callId: CALL_ID,
      recordingAuthorized: true,
    }];

    assert.deepEqual(
      h.eventsFor(alice.id, "call:recording-authorization").map(
        (event) => event.payload,
      ),
      expected,
    );

    assert.deepEqual(
      h.eventsFor(bob.id, "call:recording-authorization").map(
        (event) => event.payload,
      ),
      expected,
    );
  });

  it("notifies the other participant and forwards offers only to that peer", async () => {
    const h = createHarness();
    const alice = h.connect("socket-alice", ALICE);
    const bob = h.connect("socket-bob", BOB);
    const mallory = h.connect("socket-mallory", MALLORY);

    await h.trigger(alice, "call:join", { callId: CALL_ID });
    await h.trigger(bob, "call:join", { callId: CALL_ID });

    assert.equal(h.eventsFor(alice.id, "call:peer-joined").length, 1);

    const description = {
      type: "offer",
      sdp: "v=0\r\ns=- test-session\r\n",
    };

    await h.trigger(alice, "call:offer", {
      callId: CALL_ID,
      description,
    });

    const received = h.eventsFor(bob.id, "call:offer");
    assert.equal(received.length, 1);
    assert.deepEqual(received[0].payload, {
      callId: CALL_ID,
      fromUserId: ALICE,
      description,
    });

    assert.equal(h.eventsFor(mallory.id, "call:offer").length, 0);
  });

  it("rejects a caller who fails upstream authorization", async () => {
    const h = createHarness({
      authorize: async () => ({
        ok: false,
        status: 404,
        async json() {
          return {};
        },
      }),
    });

    const alice = h.connect("socket-alice", ALICE);

    await h.trigger(alice, "call:join", { callId: CALL_ID });

    assert.equal(h.eventsFor(alice.id, "call:joined").length, 0);
    assert.equal(
      h.eventsFor(alice.id, "call:error")[0]?.payload.code,
      "call_not_authorized",
    );
  });

  it("rejects malformed call IDs and invalid SDP", async () => {
    const h = createHarness();
    const alice = h.connect("socket-alice", ALICE);

    await h.trigger(alice, "call:join", { callId: "not-a-uuid" });
    assert.equal(
      h.eventsFor(alice.id, "call:error")[0]?.payload.code,
      "invalid_request",
    );

    await h.trigger(alice, "call:join", { callId: CALL_ID });
    await h.trigger(alice, "call:offer", {
      callId: CALL_ID,
      description: { type: "offer", sdp: "x".repeat(140 * 1024) },
    });

    assert.equal(
      h.eventsFor(alice.id, "call:error").at(-1)?.payload.code,
      "invalid_description",
    );
  });

  it("does not accept signaling from a socket that has not joined", async () => {
    const h = createHarness();
    const alice = h.connect("socket-alice", ALICE);
    const bob = h.connect("socket-bob", BOB);

    await h.trigger(alice, "call:join", { callId: CALL_ID });

    await h.trigger(bob, "call:offer", {
      callId: CALL_ID,
      description: { type: "offer", sdp: "v=0\r\n" },
    });

    assert.equal(h.eventsFor(alice.id, "call:offer").length, 0);
    assert.equal(
      h.eventsFor(bob.id, "call:error").at(-1)?.payload.code,
      "session_not_authorized",
    );
  });

  it("invalidates a session and prevents subsequent signaling", async () => {
    const h = createHarness();
    const alice = h.connect("socket-alice", ALICE);
    const bob = h.connect("socket-bob", BOB);

    await h.trigger(alice, "call:join", { callId: CALL_ID });
    await h.trigger(bob, "call:join", { callId: CALL_ID });

    h.relay.invalidateCall(CALL_ID);

    await h.trigger(alice, "call:offer", {
      callId: CALL_ID,
      description: { type: "offer", sdp: "v=0\r\n" },
    });

    assert.equal(h.eventsFor(bob.id, "call:offer").length, 0);
    assert.equal(
      h.eventsFor(alice.id, "call:error").at(-1)?.payload.code,
      "session_not_authorized",
    );
  });

  it("rejects mismatched SDP types", async () => {
    const h = createHarness();
    const alice = h.connect("socket-alice", ALICE);
    const bob = h.connect("socket-bob", BOB);

    await h.trigger(alice, "call:join", { callId: CALL_ID });
    await h.trigger(bob, "call:join", { callId: CALL_ID });

    await h.trigger(alice, "call:offer", {
      callId: CALL_ID,
      description: { type: "answer", sdp: "v=0\\r\\n" },
    });

    assert.equal(h.eventsFor(bob.id, "call:offer").length, 0);
    assert.equal(
      h.eventsFor(alice.id, "call:error").at(-1)?.payload.code,
      "invalid_description",
    );

    await h.trigger(bob, "call:answer", {
      callId: CALL_ID,
      description: { type: "offer", sdp: "v=0\\r\\n" },
    });

    assert.equal(h.eventsFor(alice.id, "call:answer").length, 0);
    assert.equal(
      h.eventsFor(bob.id, "call:error").at(-1)?.payload.code,
      "invalid_description",
    );
  });

  it("enforces the configured session capacity", async () => {
    const h = createHarness({ maxSessions: 1 });
    const alice = h.connect("socket-alice", ALICE);

    await h.trigger(alice, "call:join", { callId: CALL_ID });
    await h.trigger(alice, "call:join", { callId: SECOND_CALL_ID });

    assert.equal(h.eventsFor(alice.id, "call:joined").length, 1);
    assert.equal(
      h.eventsFor(alice.id, "call:error").at(-1)?.payload.code,
      "capacity_reached",
    );
  });

  it("invalidates a session when reauthorization is denied", async () => {
    let currentTime = 0;
    let revoked = false;

    const h = createHarness({
      clock: () => currentTime,
      authorize: async (_url, options) => {
        const input = JSON.parse(options.body);

        if (revoked && input.actorId.toLowerCase() === BOB) {
          return {
            ok: false,
            status: 404,
            async json() {
              return {};
            },
          };
        }

        return {
          ok: true,
          async json() {
            return {
              callId: input.callId,
              peerId:
                input.actorId.toLowerCase() === ALICE ? BOB : ALICE,
              type: "AUDIO",
              recordingAuthorized: true,
            };
          },
        };
      },
    });

    const alice = h.connect("socket-alice", ALICE);
    const bob = h.connect("socket-bob", BOB);

    await h.trigger(alice, "call:join", { callId: CALL_ID });
    await h.trigger(bob, "call:join", { callId: CALL_ID });

    revoked = true;
    currentTime = 16_000;

    await h.trigger(alice, "call:offer", {
      callId: CALL_ID,
      description: { type: "offer", sdp: "v=0\\r\\n" },
    });

    assert.equal(h.eventsFor(bob.id, "call:offer").length, 0);
    assert.equal(
      h.eventsFor(alice.id, "call:error").at(-1)?.payload.code,
      "call_not_authorized",
    );
  });

  it("revokes recording authorization without ending the call", async () => {
    let currentTime = 0;
    let recordingAuthorized = true;

    const h = createHarness({
      clock: () => currentTime,
      freshnessIntervalMs: 15_000,
      authorize: async (_url, options) => {
        const input = JSON.parse(options.body);

        return {
          ok: true,
          async json() {
            return {
              callId: input.callId,
              peerId: input.actorId.toLowerCase() === ALICE ? BOB : ALICE,
              type: "AUDIO",
              recordingAuthorized,
            };
          },
        };
      },
    });

    const alice = h.connect("socket-alice", ALICE);
    const bob = h.connect("socket-bob", BOB);

    await h.trigger(alice, "call:join", { callId: CALL_ID });
    await h.trigger(bob, "call:join", { callId: CALL_ID });

    recordingAuthorized = false;
    currentTime = 16_000;

    const description = {
      type: "offer",
      sdp: "v=0\\r\\n",
    };

    await h.trigger(alice, "call:offer", {
      callId: CALL_ID,
      description,
    });

    const expectedRevocation = [{
      callId: CALL_ID,
      recordingAuthorized: false,
    }];

    assert.deepEqual(
      h.eventsFor(alice.id, "call:recording-authorization").map((event) => event.payload),
      expectedRevocation,
    );
    assert.deepEqual(
      h.eventsFor(bob.id, "call:recording-authorization").map((event) => event.payload),
      expectedRevocation,
    );

    assert.equal(h.eventsFor(alice.id, "call:error").length, 0);
    assert.deepEqual(h.eventsFor(bob.id, "call:offer").map((event) => event.payload), [{
      callId: CALL_ID,
      fromUserId: ALICE,
      description,
    }]);
  });

  it("shares in-flight authorization between signals and periodic revalidation", async () => {
    let currentTime = 0;
    let holdRefresh = false;
    let authorizationCalls = 0;
    const pending = [];

    const h = createHarness({
      clock: () => currentTime,
      freshnessIntervalMs: 15_000,
      authorize: async (_url, options) => {
        authorizationCalls += 1;
        const input = JSON.parse(options.body);

        const response = () => ({
          ok: true,
          async json() {
            return {
              callId: input.callId,
              peerId: input.actorId.toLowerCase() === ALICE ? BOB : ALICE,
              type: "AUDIO",
              recordingAuthorized: true,
            };
          },
        });

        if (holdRefresh) {
          return new Promise((resolve) => pending.push(() => resolve(response())));
        }

        return response();
      },
    });

    const alice = h.connect("socket-alice", ALICE);
    const bob = h.connect("socket-bob", BOB);

    await h.trigger(alice, "call:join", { callId: CALL_ID });
    await h.trigger(bob, "call:join", { callId: CALL_ID });
    assert.equal(authorizationCalls, 4);

    currentTime = 16_000;
    holdRefresh = true;

    const signalPromise = h.trigger(alice, "call:offer", {
      callId: CALL_ID,
      description: { type: "offer", sdp: "v=0\\r\\n" },
    });

    // Let the signal handler begin both upstream authorization requests.
    await Promise.resolve();
    assert.equal(pending.length, 2);

    const periodicPromise = h.relay.revalidateSessions();

    // The periodic check must await the existing per-session promise.
    assert.equal(authorizationCalls, 6);
    assert.equal(pending.length, 2);

    for (const resolve of pending) resolve();

    await Promise.all([signalPromise, periodicPromise]);

    assert.equal(h.eventsFor(bob.id, "call:offer").length, 1);
  });

  it("does not notify peers until the user's last socket leaves", async () => {
    const h = createHarness();
    const alicePhone = h.connect("socket-alice-phone", ALICE);
    const aliceTablet = h.connect("socket-alice-tablet", ALICE);
    const bob = h.connect("socket-bob", BOB);

    await h.trigger(alicePhone, "call:join", { callId: CALL_ID });
    await h.trigger(aliceTablet, "call:join", { callId: CALL_ID });
    await h.trigger(bob, "call:join", { callId: CALL_ID });

    alicePhone.connected = false;
    await h.trigger(alicePhone, "disconnect");

    assert.equal(h.eventsFor(bob.id, "call:peer-left").length, 0);

    aliceTablet.connected = false;
    await h.trigger(aliceTablet, "disconnect");

    assert.deepEqual(
      h.eventsFor(bob.id, "call:peer-left").map((event) => event.payload),
      [{ callId: CALL_ID }],
    );
  });

  it("notifies the remaining participant when a peer disconnects", async () => {
    const h = createHarness();
    const alice = h.connect("socket-alice", ALICE);
    const bob = h.connect("socket-bob", BOB);

    await h.trigger(alice, "call:join", { callId: CALL_ID });
    await h.trigger(bob, "call:join", { callId: CALL_ID });

    alice.connected = false;
    await h.trigger(alice, "disconnect");

    assert.deepEqual(
      h.eventsFor(bob.id, "call:peer-left").map((event) => event.payload),
      [{ callId: CALL_ID }],
    );
  });

  it("removes session membership when a socket disconnects", async () => {
    const h = createHarness();
    const alice = h.connect("socket-alice", ALICE);
    const bob = h.connect("socket-bob", BOB);

    await h.trigger(alice, "call:join", { callId: CALL_ID });
    await h.trigger(bob, "call:join", { callId: CALL_ID });

    alice.connected = false;
    await h.trigger(alice, "disconnect");

    await h.trigger(bob, "call:offer", {
      callId: CALL_ID,
      description: { type: "offer", sdp: "v=0\r\n" },
    });

    assert.equal(h.eventsFor(alice.id, "call:offer").length, 0);
  });
});
