/** Validated, owner-scoped Redis progress delivery for multi-agent tasks. */

const CHANNEL = "relay:multi-agent:progress:v1";
const SOCKET_EVENT = "multiAgentTaskProgress";
const MAX_MESSAGE_BYTES = 8192;
const MAX_STEPS = 12;

const PHASES = new Set(["planning", "executing", "reviewing", "completed", "failed"]);
const ROLES = new Set(["planner", "executor", "memory", "reviewer", "coordinator"]);
const STATUSES = new Set(["pending", "running", "completed", "failed", "skipped"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_ID_RE = /^[0-9a-f]{24}$/;
const STEP_ID_RE = /^[a-z][a-z0-9_-]{0,63}$/;

function hasExactKeys(value, keys) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}

export function validateMultiAgentProgressEvent(event) {
  if (!hasExactKeys(event, ["version", "task_id", "relay_user_id", "progress"])) {
    return false;
  }

  if (
    event.version !== 1 ||
    typeof event.task_id !== "string" ||
    !UUID_RE.test(event.task_id) ||
    typeof event.relay_user_id !== "string" ||
    !OBJECT_ID_RE.test(event.relay_user_id) ||
    !hasExactKeys(event.progress, ["phase", "steps"])
  ) {
    return false;
  }

  const { phase, steps } = event.progress;
  if (!PHASES.has(phase) || !Array.isArray(steps) || steps.length > MAX_STEPS) {
    return false;
  }

  const seen = new Set();
  for (const step of steps) {
    if (!hasExactKeys(step, ["step_id", "role", "status"])) {
      return false;
    }

    if (
      typeof step.step_id !== "string" ||
      !STEP_ID_RE.test(step.step_id) ||
      seen.has(step.step_id) ||
      !ROLES.has(step.role) ||
      !STATUSES.has(step.status)
    ) {
      return false;
    }

    seen.add(step.step_id);
  }

  return true;
}

export function createMultiAgentProgressSubscriber({
  redis,
  io,
  getUserRoom,
  logger = console,
}) {
  if (!redis || typeof redis.duplicate !== "function") {
    throw new TypeError("A Redis client with duplicate() is required");
  }
  if (!io || typeof io.to !== "function" || typeof getUserRoom !== "function") {
    throw new TypeError("Socket.IO and getUserRoom are required");
  }

  let subscriber;
  let startPromise;
  let stopPromise;
  let stopped = false;

  function handleMessage(channel, message) {
    if (channel !== CHANNEL || typeof message !== "string") return;
    if (Buffer.byteLength(message, "utf8") > MAX_MESSAGE_BYTES) {
      logger.warn("[multi-agent-progress] Rejected oversized event");
      return;
    }

    let event;
    try {
      event = JSON.parse(message);
    } catch {
      logger.warn("[multi-agent-progress] Rejected invalid JSON");
      return;
    }

    if (!validateMultiAgentProgressEvent(event)) {
      logger.warn("[multi-agent-progress] Rejected invalid event");
      return;
    }

    try {
      io.to(getUserRoom(event.relay_user_id)).emit(SOCKET_EVENT, {
        task_id: event.task_id,
        progress: event.progress,
      });
    } catch (error) {
      logger.error("[multi-agent-progress] Delivery failed", {
        name: error?.name ?? "Error",
      });
    }
  }

  async function start() {
    if (stopped) throw new Error("Progress subscriber has been stopped");
    if (subscriber?.isReady) return;
    if (startPromise) return startPromise;

    startPromise = (async () => {
      const client = redis.duplicate();
      subscriber = client;

      client.on("error", (error) => {
        logger.error("[multi-agent-progress] Redis subscriber error", {
          name: error?.name ?? "Error",
        });
      });

      try {
        if (!client.isOpen) await client.connect();
        await client.subscribe(CHANNEL, (message, channel) => {
          handleMessage(channel, message);
        });
      } catch (error) {
        subscriber = undefined;
        try {
          if (client.isOpen) await client.quit();
        } catch {
          // Preserve the original startup failure.
        }
        throw error;
      }
    })();

    try {
      await startPromise;
    } finally {
      startPromise = undefined;
    }
  }

  async function stop() {
    stopped = true;
    if (stopPromise) return stopPromise;

    stopPromise = (async () => {
      // Wait for an in-flight subscription attempt to settle before cleanup.
      if (startPromise) {
        try {
          await startPromise;
        } catch {
          // Startup already reported the error.
        }
      }

      const client = subscriber;
      subscriber = undefined;
      if (!client) return;

      try {
        if (client.isOpen) await client.quit();
      } catch (error) {
        logger.error("[multi-agent-progress] Redis subscriber shutdown failed", {
          name: error?.name ?? "Error",
        });
        throw error;
      }
    })();

    return stopPromise;
  }

  return { start, stop };
}
