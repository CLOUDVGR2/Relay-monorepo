/** HTTP route handlers for message route in the Relay Express API. */

import express from "express";

import { protectRoute } from "../middleware/auth.middleware.js";

import {
  editMessage,
  getMessages,
  getUsersForSidebar,
  markMessagesRead,
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
 * /api/messages/read/{id}:
 *   post:
 *     tags: [Messages]
 *     summary: Mark conversation messages as read
 *     description: Marks unread messages from the specified sender as read by the authenticated user.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the other conversation participant
 *     responses:
 *       200:
 *         description: Read status updated, or no unread messages were found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messageIds:
 *                   type: array
 *                   items:
 *                     type: string
 *                 readAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *       400:
 *         description: Invalid sender ID or sender is the authenticated user
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post("/read/:id", protectRoute, markMessagesRead);

/**
 * @swagger
 * /api/messages/{id}:
 *   patch:
 *     tags: [Messages]
 *     summary: Edit a sent text message
 *     description: Updates the text of a message sent by the authenticated user. Only text messages can be edited. The update is broadcast to both conversation participants.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the message
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 5000
 *                 example: "Updated message text"
 *     responses:
 *       200:
 *         description: Message updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       400:
 *         description: Invalid message ID, invalid text, or message is not a text message
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.patch("/:id", protectRoute, editMessage);

/**
 * @swagger
 * /api/messages/send/{id}:
 *   post:
 *     tags: [Messages]
 *     summary: Send a message
 *     description: Sends a text message, image message, or both. Images must be supported Base64 image data URIs and must not exceed 7 MiB. A reply target must belong to this conversation. Rate limited.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the recipient
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *                 maxLength: 5000
 *                 example: "Hello, how are you?"
 *               image:
 *                 type: string
 *                 description: Supported Base64 image data URI; maximum 7 MiB
 *                 example: "data:image/png;base64,..."
 *               replyTo:
 *                 type: string
 *                 description: Optional MongoDB ObjectId of a message in this conversation
 *             description: Provide text, image, or both.
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
 *       400:
 *         description: Invalid recipient, message text, image payload, or reply target
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Recipient not found
 *       413:
 *         description: Image exceeds the 7 MiB limit
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post("/send/:id", protectRoute, sendMessageRateLimiter, sendMessage);

export default router;
