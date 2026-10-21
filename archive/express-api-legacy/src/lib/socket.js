/** Socket module for the Relay archived legacy Express implementation. */

import { Server } from "socket.io";
import http from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { parseCookie } from "cookie";
import mongoose from "mongoose";

import User from "../models/user.model.js";

// -----------------------------------------------------------------------------
// HTTP and Socket.IO server
// -----------------------------------------------------------------------------

// Create the Express application and its underlying HTTP server.
const app = express();
const server = http.createServer(app);

// Track whether the application is shutting down.
let isShuttingDown = false;
let closePromise;

// Use the same frontend origin configuration as the HTTP API.
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : process.env.NODE_ENV === "production"
    ? []
    : ["http://localhost:5173", "http://localhost:5174"];

// Configure Socket.IO with credentialed browser connections.
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      // Non-browser clients may not send an Origin header.
      // Authentication is still required below.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed"));
    },
    credentials: true,
  },
});

// -----------------------------------------------------------------------------
// Connection tracking
// -----------------------------------------------------------------------------

// Track all active socket connections for each authenticated user.
// Map<userId, Set<socketId>> supports multiple tabs and devices.
const userSocketMap = new Map();

// Give each authenticated user a private room for message delivery.
export const getUserRoom = (userId) => `user:${String(userId)}`;

// Preserve the helper for code that expects one socket ID.
// Prefer getReceiverSocketIds() or private rooms for multi-device delivery.
export function getReceiverSocketId(userId) {
  const socketIds = userSocketMap.get(String(userId));

  return socketIds?.values().next().value;
}

// Return every active connection belonging to a user.
export function getReceiverSocketIds(userId) {
  return [...(userSocketMap.get(String(userId)) ?? [])];
}

// Return the IDs of users who currently have at least one active connection.
function getOnlineUserIds() {
  return [...userSocketMap.keys()];
}

// -----------------------------------------------------------------------------
// Socket.IO shutdown
// -----------------------------------------------------------------------------

// Stop accepting new connections and close existing Socket.IO connections.
// Repeated calls share the same promise.
export function closeSocketServer() {
  if (closePromise) {
    return closePromise;
  }

  isShuttingDown = true;

  closePromise = new Promise((resolve) => {
    io.close(() => {
      userSocketMap.clear();

      console.log("Socket.IO server closed.");

      resolve();
    });
  });

  return closePromise;
}

// -----------------------------------------------------------------------------
// Socket authentication
// -----------------------------------------------------------------------------

// Authenticate every Socket.IO connection using the HTTP-only JWT cookie.
io.use(async (socket, next) => {
  // Reject new connections once shutdown has started.
  if (isShuttingDown) {
    return next(new Error("Server shutting down"));
  }

  try {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      console.error(
        "Socket authentication failed: JWT_SECRET is not configured",
      );

      return next(new Error("Authentication unavailable"));
    }

    // Parse the cookie header from the Socket.IO handshake.
    const cookieHeader = socket.handshake.headers.cookie;
    const cookies = cookieHeader ? parseCookie(cookieHeader) : {};
    const token = cookies.jwt;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    // Verify the signature and expiration before trusting the token payload.
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
    });

    if (
      typeof decoded !== "object" ||
      !decoded.userId ||
      !mongoose.isValidObjectId(decoded.userId)
    ) {
      return next(new Error("Invalid authentication token"));
    }

    // Confirm that the account still exists.
    const user = await User.findById(decoded.userId).select("_id");

    if (!user) {
      return next(new Error("Authentication required"));
    }

    // Shutdown may have started while the database lookup was running.
    if (isShuttingDown) {
      return next(new Error("Server shutting down"));
    }

    // The verified database identity is the only source of socket identity.
    socket.data.userId = user._id.toString();

    return next();
  } catch {
    // Avoid exposing token details or internal exceptions to clients.
    return next(new Error("Authentication required"));
  }
});

// -----------------------------------------------------------------------------
// Connection lifecycle
// -----------------------------------------------------------------------------

// Register authenticated connections and track online users.
io.on("connection", (socket) => {
  // Defensive check in case shutdown began before registration.
  if (isShuttingDown) {
    socket.disconnect(true);
    return;
  }

  const userId = socket.data.userId;

  let socketIds = userSocketMap.get(userId);

  if (!socketIds) {
    socketIds = new Set();
    userSocketMap.set(userId, socketIds);
  }

  socketIds.add(socket.id);

  // Join the user's private room for delivery to all their devices.
  socket.join(getUserRoom(userId));

  // Broadcast the current set of online user IDs.
  io.emit("getOnlineUsers", getOnlineUserIds());

  socket.on("disconnect", () => {
    const activeSockets = userSocketMap.get(userId);

    // Remove only this connection; other tabs and devices may remain online.
    if (activeSockets) {
      activeSockets.delete(socket.id);

      // Mark the user offline only when their final connection closes.
      if (activeSockets.size === 0) {
        userSocketMap.delete(userId);
      }
    }

    // Do not broadcast during shutdown.
    if (!isShuttingDown) {
      io.emit("getOnlineUsers", getOnlineUserIds());
    }
  });
});

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export { io, app, server };
