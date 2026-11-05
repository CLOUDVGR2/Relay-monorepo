/** Authenticated server-to-server call-event delivery. */

import express from "express";
import { timingSafeEqual } from "node:crypto";

const router = express.Router();

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;
const ALLOWED_EVENT_TYPES = new Set(["invitation", "updated"]);
const ALLOWED_CALL_TYPES = new Set(["AUDIO", "VIDEO"]);
const ALLOWED_CALL_STATUSES = new Set([
  "RINGING",
  "ACTIVE",
  "ENDED",
  "CANCELLED",
]);

function validBearerToken(header, expectedToken) {
  if (
    typeof header !== "string" ||
    typeof expectedToken !== "string" ||
    !expectedToken.trim()
  ) {
    return false;
  }

  const match = /^Bearer ([^\s]+)$/.exec(header);

  if (!match) {
    return false;
  }

  const supplied = Buffer.from(match[1], "utf8");
  const expected = Buffer.from(expectedToken, "utf8");

  return (
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
  );
}

/**
 * Dependencies are injected so the route can be tested without opening
 * a real Socket.IO server or connecting to MongoDB.
 */
export function createInternalCallEventsRouter({
  io,
  getUserRoom,
  getToken = () => process.env.CALL_EVENTS_INTERNAL_TOKEN,
  invalidateCallMediaSession = () => {},
  createIncomingCallNotifications = async () => {},
}) {
  if (!io || typeof io.to !== "function") {
    throw new TypeError("A Socket.IO server is required.");
  }

  if (typeof getUserRoom !== "function") {
    throw new TypeError("A private-room resolver is required.");
  }

  const handler = (req, res) => {
    const expectedToken = getToken();

    if (typeof expectedToken !== "string" || !expectedToken.trim()) {
      return res.status(503).json({
        success: false,
        message: "Call event delivery is not configured.",
      });
    }

    if (!validBearerToken(req.get("authorization"), expectedToken)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    const body = req.body;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({
        success: false,
        message: "Invalid call event.",
      });
    }

    const {
      eventType,
      callId,
      conversationId,
      initiatorId,
      type,
      status,
      participantIds,
      createdAt,
    } = body;

    if (
      !ALLOWED_EVENT_TYPES.has(eventType) ||
      typeof callId !== "string" ||
      !UUID_PATTERN.test(callId) ||
      typeof conversationId !== "string" ||
      !UUID_PATTERN.test(conversationId) ||
      typeof initiatorId !== "string" ||
      !OBJECT_ID_PATTERN.test(initiatorId) ||
      !ALLOWED_CALL_TYPES.has(type) ||
      !ALLOWED_CALL_STATUSES.has(status) ||
      !Array.isArray(participantIds) ||
      participantIds.length < 1 ||
      participantIds.length > 50 ||
      !participantIds.every(
        (id) => typeof id === "string" && OBJECT_ID_PATTERN.test(id),
      ) ||
      new Set(participantIds.map((id) => id.toLowerCase())).size !==
        participantIds.length ||
      !participantIds.some(
        (id) => id.toLowerCase() === initiatorId.toLowerCase(),
      ) ||
      typeof createdAt !== "string" ||
      Number.isNaN(Date.parse(createdAt))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid call event.",
      });
    }

    const payload = {
      eventType,
      callId,
      conversationId,
      initiatorId,
      type,
      status,
      participantIds: participantIds.map((id) => id.toLowerCase()),
      createdAt,
    };

    // Deliver only to authenticated users' server-assigned private rooms.
    let target = io.to(getUserRoom(payload.participantIds[0]));

    for (const userId of payload.participantIds.slice(1)) {
      target = target.to(getUserRoom(userId));
    }

    target.emit("callEvent", payload);

    // Push only for new audio-call invitations. Do not send pushes for
    // updates, cancellations, terminal events, or video calls.
    if (
      payload.eventType === "invitation" &&
      payload.status === "RINGING" &&
      payload.type === "AUDIO"
    ) {
      console.info("[IncomingCallPush] Audio invitation received", {
        callId: payload.callId,
        recipientCount: payload.participantIds.length - 1,
      });

      const inviteeIds = payload.participantIds.filter(
        (id) => id !== payload.initiatorId.toLowerCase(),
      );

      void Promise.resolve(
        createIncomingCallNotifications({
          callerId: payload.initiatorId,
          recipientIds: inviteeIds,
          callId: payload.callId,
          conversationId: payload.conversationId,
        }),
      ).catch((error) => {
        console.error("Incoming-call push dispatch failed:", error?.message);
      });
    }

    if (payload.status === "ENDED" || payload.status === "CANCELLED") {
      invalidateCallMediaSession(payload.callId);
    }

    return res.status(202).json({ success: true });
  };

  router.post("/call-events", express.json({ limit: "8kb" }), handler);

  return router;
}
