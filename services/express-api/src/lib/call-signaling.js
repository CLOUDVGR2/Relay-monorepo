import mongoose from "mongoose";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_DESCRIPTION_BYTES = 128 * 1024;
const MAX_CANDIDATE_BYTES = 8 * 1024;
const SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 500;
const REAUTHORIZATION_INTERVAL_MS = 15_000;
const MAX_EVENTS_PER_WINDOW = 60;
const RATE_WINDOW_MS = 10_000;

const SIGNAL_EVENTS = new Set(["call:offer", "call:answer", "call:ice"]);

function byteLength(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Infinity;
  }
}

function validDescription(value, expectedType) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.type === expectedType &&
    typeof value.sdp === "string" &&
    value.sdp.length > 0 &&
    byteLength(value) <= MAX_DESCRIPTION_BYTES
  );
}

function validCandidate(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.candidate === "string" &&
    value.candidate.length > 0 &&
    byteLength(value) <= MAX_CANDIDATE_BYTES
  );
}

function callLog(source, result, message, details = {}) {
  console.info(`[${source}][${result}] ${message}`, {
    time: new Date().toISOString(),
    ...details,
  });
}

export function createCallSignalingRelay({
  io,
  fetchImpl = globalThis.fetch,
  getBaseUrl = () => process.env.NEST_API_BASE_URL,
  getToken = () => process.env.CALL_EVENTS_INTERNAL_TOKEN,
  now = Date.now,
  maxSessions = MAX_SESSIONS,
  reauthorizationIntervalMs = REAUTHORIZATION_INTERVAL_MS,
  freshnessIntervalMs = REAUTHORIZATION_INTERVAL_MS,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
}) {
  if (!io || typeof io.to !== "function") {
    throw new TypeError("A Socket.IO server is required.");
  }

  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required.");
  }

  const sessions = new Map();
  const socketSessions = new Map();
  const rateWindows = new Map();
  let closed = false;
  let reauthorizationInProgress = false;

  function emitError(socket, code, callId) {
    socket.emit("call:error", {
      code,
      ...(typeof callId === "string" && UUID_PATTERN.test(callId)
        ? { callId }
        : {}),
    });
  }

  function removeSocketFromSession(socketId, callId) {
    const session = sessions.get(callId);
    if (!session) return;

    for (const [userId, socketIds] of session.members) {
      socketIds.delete(socketId);

      if (socketIds.size === 0) {
        session.members.delete(userId);

        // Notify peers only when this participant has no remaining sockets.
        for (const peerSocketIds of session.members.values()) {
          for (const peerSocketId of peerSocketIds) {
            io.to(peerSocketId).emit("call:peer-left", { callId });
          }
        }
      }
    }

    if (session.members.size === 0) {
      sessions.delete(callId);
    }

    const joined = socketSessions.get(socketId);
    joined?.delete(callId);

    if (joined?.size === 0) {
      socketSessions.delete(socketId);
    }
  }
  function removeSession(callId) {
    const session = sessions.get(callId);
    if (!session) return;

    for (const socketIds of session.members.values()) {
      for (const socketId of socketIds) {
        const joined = socketSessions.get(socketId);
        joined?.delete(callId);

        if (joined?.size === 0) {
          socketSessions.delete(socketId);
        }
      }
    }

    sessions.delete(callId);
  }

  function updateRecordingAuthorization(session, authorized) {
    if (session.recordingAuthorized === authorized) return;

    session.recordingAuthorized = authorized;

    for (const socketIds of session.members.values()) {
      for (const socketId of socketIds) {
        io.to(socketId).emit("call:recording-authorization", {
          callId: session.callId,
          recordingAuthorized: authorized,
        });
      }
    }
  }

  function allowEvent(socket) {
    const timestamp = now();
    let window = rateWindows.get(socket.id);

    if (!window || timestamp - window.startedAt >= RATE_WINDOW_MS) {
      window = { startedAt: timestamp, count: 0 };
      rateWindows.set(socket.id, window);
    }

    window.count += 1;
    return window.count <= MAX_EVENTS_PER_WINDOW;
  }

  async function authorize(callId, actorId) {
    const baseUrl = getBaseUrl();
    const token = getToken();

    if (
      typeof baseUrl !== "string" ||
      !baseUrl.trim() ||
      typeof token !== "string" ||
      !token.trim()
    ) {
      throw new Error("authorization_unavailable");
    }

    const response = await fetchImpl(
      `${baseUrl.replace(/\/+$/, "")}/internal/media-sessions/authorize`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ callId, actorId }),
        signal: AbortSignal.timeout(3000),
      },
    );

    callLog("EXPRESS", response.ok ? "PASS" : "FAIL", "Nest authorization HTTP response", {
      callId,
      actorId,
      status: response.status,
    });

    if (!response.ok) {
      throw new Error("authorization_denied");
    }

    const result = await response.json();

    callLog("EXPRESS", "PASS", "Nest authorization response parsed", {
      callId,
      actorId,
      recordingAuthorized: result?.recordingAuthorized,
      type: typeof result?.recordingAuthorized,
    });

    if (
      result?.callId !== callId ||
      typeof result.peerId !== "string" ||
      !mongoose.isValidObjectId(result.peerId) ||
      result.peerId.toLowerCase() === actorId.toLowerCase() ||
      result.type !== "AUDIO" ||
      typeof result.recordingAuthorized !== "boolean"
    ) {
      throw new Error("invalid_authorization_response");
    }

    return {
      callId,
      peerId: result.peerId.toLowerCase(),
      type: result.type,
      recordingAuthorized: result.recordingAuthorized,
    };
  }

  async function reauthorizeSession(callId, session) {
    if (sessions.get(callId) !== session || closed) return false;

    if (now() - session.createdAt >= SESSION_TTL_MS) {
      removeSession(callId);
      return false;
    }

    if (session.reauthorizationPromise) {
      return session.reauthorizationPromise;
    }

    const users = [...session.users];

    session.reauthorizationPromise = (async () => {
      try {
        if (users.length !== 2) {
          throw new Error("authorization_denied");
        }

        const [first, second] = users;
        const results = await Promise.all([
          authorize(callId, first),
          authorize(callId, second),
        ]);

        callLog("EXPRESS", "PASS", "Both participants reauthorized", {
          callId,
          results: results.map((r) => ({
            peerId: r.peerId,
            recordingAuthorized: r.recordingAuthorized,
          })),
        });

        // The call could have ended while authorization was in flight.
        if (
          closed ||
          sessions.get(callId) !== session ||
          now() - session.createdAt >= SESSION_TTL_MS ||
          results[0].peerId !== second ||
          results[1].peerId !== first ||
          results[0].type !== session.type ||
          results[1].type !== session.type
        ) {
          throw new Error("authorization_denied");
        }

        updateRecordingAuthorization(
          session,
          results.every((result) => result.recordingAuthorized === true),
        );

        session.authorizedAt = now();
        return true;
      } catch (error) {
        callLog("EXPRESS", "FAIL", "Session reauthorization failed", {
          callId,
          error: error?.message,
        });

        // Fail closed if authorization is denied, unavailable, or inconsistent.
        if (sessions.get(callId) === session) {
          removeSession(callId);
        }
        return false;
      } finally {
        session.reauthorizationPromise = null;
      }
    })();

    return session.reauthorizationPromise;
  }

  async function revalidateSessions() {
    if (closed || reauthorizationInProgress) return;

    reauthorizationInProgress = true;

    try {
      // The session cap bounds this work. Both timer and signal checks share
      // each session's in-flight authorization promise.
      for (const [callId, session] of [...sessions.entries()]) {
        if (closed) break;
        if (sessions.get(callId) !== session) continue;

        if (now() - session.createdAt >= SESSION_TTL_MS) {
          removeSession(callId);
          continue;
        }

        await reauthorizeSession(callId, session);
      }
    } finally {
      reauthorizationInProgress = false;
    }
  }

  const reauthorizationTimer =
    reauthorizationIntervalMs > 0
      ? setIntervalImpl(() => {
          void revalidateSessions();
        }, reauthorizationIntervalMs)
      : undefined;

  reauthorizationTimer?.unref?.();

  function attach(socket) {
    const actorId = String(socket.data.userId ?? "").toLowerCase();

    if (!mongoose.isValidObjectId(actorId)) {
      socket.disconnect(true);
      return;
    }

    socket.on("call:join", async (payload) => {
      if (!allowEvent(socket)) {
        emitError(socket, "rate_limited", payload?.callId);
        return;
      }

      const callId = payload?.callId;

      if (
        !payload ||
        typeof payload !== "object" ||
        !UUID_PATTERN.test(callId ?? "")
      ) {
        emitError(socket, "invalid_request", callId);
        return;
      }

      try {
        const authorization = await authorize(callId, actorId);

        // Authorization can finish after the socket has disconnected.
        if (!socket.connected) return;

        const peerId = authorization.peerId;
        let session = sessions.get(callId);

        if (session && now() - session.createdAt >= SESSION_TTL_MS) {
          removeSession(callId);
          session = undefined;
        }

        if (session) {
          const allowedUsers = new Set([actorId, peerId]);

          if (
            allowedUsers.size !== 2 ||
            session.users.size !== 2 ||
            [...session.users].some((id) => !allowedUsers.has(id)) ||
            session.type !== authorization.type
          ) {
            emitError(socket, "session_conflict", callId);
            return;
          }
        } else {
          if (sessions.size >= maxSessions) {
            emitError(socket, "capacity_reached", callId);
            return;
          }

          session = {
            callId,
            users: new Set([actorId, peerId]),
            members: new Map(),
            type: authorization.type,
            recordingAuthorized: authorization.recordingAuthorized,
            createdAt: now(),
            authorizedAt: now(),
            reauthorizationPromise: null,
          };
          sessions.set(callId, session);
        }

        if (!authorization.recordingAuthorized) {
          updateRecordingAuthorization(session, false);
        }

        let actorSockets = session.members.get(actorId);

        if (!actorSockets) {
          actorSockets = new Set();
          session.members.set(actorId, actorSockets);
        }

        actorSockets.add(socket.id);

        let joined = socketSessions.get(socket.id);

        if (!joined) {
          joined = new Set();
          socketSessions.set(socket.id, joined);
        }

        joined.add(callId);

        // Recheck both participants once both have joined.
        if (session.members.size === 2) {
          const authorized = await reauthorizeSession(callId, session);

          if (!authorized) {
            emitError(socket, "call_not_authorized", callId);
            return;
          }
        }

        console.info("[Call signaling] Emitting joined", {
          callId,
          recordingAuthorized: session.recordingAuthorized,
          recordingAuthorizedType: typeof session.recordingAuthorized,
        });

        callLog(
          "EXPRESS",
          typeof session.recordingAuthorized === "boolean" ? "PASS" : "FAIL",
          "Sending call:joined",
          {
            callId,
            socketId: socket.id,
            recordingAuthorized: session.recordingAuthorized,
            type: typeof session.recordingAuthorized,
          },
        );

        socket.emit("call:joined", {
          callId,
          type: session.type,
          peerConnected: session.members.has(peerId),
          recordingAuthorized: session.recordingAuthorized,
        });

        // Notify only the other participant's sockets in this session.
        for (const peerSocketId of session.members.get(peerId) ?? []) {
          io.to(peerSocketId).emit("call:peer-joined", { callId });
        }
      } catch (error) {
        // Do not send upstream errors, URLs, or authorization details to clients.
        emitError(
          socket,
          error?.message === "authorization_denied"
            ? "call_not_authorized"
            : "authorization_unavailable",
          callId,
        );
      }
    });

    async function ensureFreshAuthorization(callId, session) {
      if (
        sessions.get(callId) !== session ||
        now() - session.createdAt >= SESSION_TTL_MS
      ) {
        if (sessions.get(callId) === session) {
          removeSession(callId);
        }
        return false;
      }

      if (now() - session.authorizedAt < freshnessIntervalMs) {
        return true;
      }

      return reauthorizeSession(callId, session);
    }

    for (const eventName of SIGNAL_EVENTS) {
      socket.on(eventName, async (payload) => {
        if (!allowEvent(socket)) {
          emitError(socket, "rate_limited", payload?.callId);
          return;
        }

        const callId = payload?.callId;
        const session = sessions.get(callId);

        if (
          !UUID_PATTERN.test(callId ?? "") ||
          !session ||
          now() - session.createdAt >= SESSION_TTL_MS ||
          !socketSessions.get(socket.id)?.has(callId) ||
          !session.members.get(actorId)?.has(socket.id)
        ) {
          emitError(socket, "session_not_authorized", callId);
          return;
        }

        if (!(await ensureFreshAuthorization(callId, session))) {
          emitError(socket, "call_not_authorized", callId);
          return;
        }

        if (
          eventName === "call:offer" &&
          !validDescription(payload.description, "offer")
        ) {
          emitError(socket, "invalid_description", callId);
          return;
        }

        if (
          eventName === "call:answer" &&
          !validDescription(payload.description, "answer")
        ) {
          emitError(socket, "invalid_description", callId);
          return;
        }

        if (eventName === "call:ice" && !validCandidate(payload.candidate)) {
          emitError(socket, "invalid_candidate", callId);
          return;
        }

        const peerId = [...session.users].find((id) => id !== actorId);

        if (!peerId) {
          emitError(socket, "session_not_authorized", callId);
          return;
        }

        const forwardedPayload = {
          callId,
          fromUserId: actorId,
          ...(eventName === "call:ice"
            ? { candidate: payload.candidate }
            : { description: payload.description }),
        };

        for (const peerSocketId of session.members.get(peerId) ?? []) {
          io.to(peerSocketId).emit(eventName, forwardedPayload);
        }
      });
    }

    socket.on("call:leave", (payload) => {
      const callId = payload?.callId;

      if (typeof callId !== "string") return;

      removeSocketFromSession(socket.id, callId);
    });

    socket.on("disconnect", () => {
      for (const callId of socketSessions.get(socket.id) ?? []) {
        removeSocketFromSession(socket.id, callId);
      }

      socketSessions.delete(socket.id);
      rateWindows.delete(socket.id);
    });
  }

  function invalidateCall(callId) {
    if (typeof callId === "string") {
      removeSession(callId);
    }
  }

  function close() {
    closed = true;

    if (reauthorizationTimer !== undefined) {
      clearIntervalImpl(reauthorizationTimer);
    }

    sessions.clear();
    socketSessions.clear();
    rateWindows.clear();
  }

  return {
    attach,
    invalidateCall,
    revalidateSessions,
    close,
  };
}
