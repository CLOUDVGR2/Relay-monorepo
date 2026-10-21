/** HTTP route handlers for message route in the Relay archived legacy Express implementation. */

import express from "express";

import { protectRoute } from "../middleware/auth.middleware.js";

import {
  getMessages,
  getUsersForSidebar,
  sendMessage,
} from "../controllers/message.controller.js";

import { sendMessageRateLimiter } from "../middleware/rate-limit.middleware.js";

const router = express.Router();

// Retrieve users for the sidebar.
// Authentication is required.
router.get("/users", protectRoute, getUsersForSidebar);

// Retrieve messages for a specific conversation.
// Authentication is required.
router.get("/:id", protectRoute, getMessages);

// Send a message to a specific recipient.
// Authentication is required, and message submissions are rate-limited.
router.post("/send/:id", protectRoute, sendMessageRateLimiter, sendMessage);

export default router;
