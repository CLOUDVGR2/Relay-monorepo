/** HTTP route handlers for message route in the Relay Express API. */

import express from "express";

import { protectRoute } from "../middleware/auth.middleware.js";

import {
  getMessages,
  getUsersForSidebar,
  sendMessage,
} from "../controllers/message.controller.js";

import { sendMessageRateLimiter } from "../middleware/rate-limit.middleware.js";

const router = express.Router();

/**
 * @swagger
 * /api/messages/users:
 *   get:
 *     tags: [Messages]
 *     summary: Get users for sidebar
 *     description: Retrieves a list of users for the chat sidebar, excluding the authenticated user.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get("/users", protectRoute, getUsersForSidebar);

/**
 * @swagger
 * /api/messages/{id}:
 *   get:
 *     tags: [Messages]
 *     summary: Get conversation messages
 *     description: Retrieves a bounded chronological page between the authenticated user and the specified user. Use the opaque before cursor to fetch older messages.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the other user in the conversation
 *         example: "507f1f77bcf86cd799439011"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Maximum number of messages in this page
 *       - in: query
 *         name: before
 *         schema:
 *           type: string
 *         description: Opaque cursor returned in the X-Next-Cursor response header
 *     responses:
 *       200:
 *         description: Messages retrieved successfully in chronological order. X-Has-More indicates whether an older page exists; X-Next-Cursor is present when it does.
 *         headers:
 *           X-Has-More:
 *             schema: { type: string, enum: ["true", "false"] }
 *           X-Next-Cursor:
 *             schema: { type: string }
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/:id", protectRoute, getMessages);

/**
 * @swagger
 * /api/messages/send/{id}:
 *   post:
 *     tags: [Messages]
 *     summary: Send a message
 *     description: Sends a message to a specific user. Supports text and image messages. Rate limited to prevent spam.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the message recipient
 *         example: "507f1f77bcf86cd799439011"
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *                 description: Message text content
 *                 example: "Hello, how are you?"
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Image file (max 5MB)
 *     responses:
 *       201:
 *         description: Message sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   $ref: '#/components/schemas/Message'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 */
router.post("/send/:id", protectRoute, sendMessageRateLimiter, sendMessage);

export default router;
