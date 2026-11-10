import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  registerPushToken,
  unregisterPushToken,
  updateNotificationPreferences,
} from "../controllers/notification.controller.js";

const router = express.Router();

router.use(protectRoute);

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List the authenticated user's notifications
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 30
 *     responses:
 *       200:
 *         description: Notifications and unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [notifications, unreadCount]
 *               properties:
 *                 notifications:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Notification record
 *                     additionalProperties: true
 *                 unreadCount:
 *                   type: integer
 *                   minimum: 0
 *       400:
 *         description: Invalid limit
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get("/", listNotifications);

/**
 * @swagger
 * /api/notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark all notifications as read
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.patch("/read-all", markAllNotificationsRead);

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark one notification as read
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[a-fA-F0-9]{24}$'
 *         description: Notification MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Updated notification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 notification:
 *                   type: object
 *                   description: Updated notification record
 *                   additionalProperties: true
 *       400:
 *         description: Invalid notification ID
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.patch("/:id/read", markNotificationRead);

/**
 * @swagger
 * /api/notifications/preferences:
 *   get:
 *     tags: [Notifications]
 *     summary: Get notification preferences
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current notification preferences
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotificationPreferences'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get("/preferences", getNotificationPreferences);

/**
 * @swagger
 * /api/notifications/preferences:
 *   put:
 *     tags: [Notifications]
 *     summary: Update notification preferences
 *     description: All fields are optional. Only supplied fields are updated.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             properties:
 *               pushEnabled:
 *                 type: boolean
 *               mutedConversationIds:
 *                 type: array
 *                 maxItems: 500
 *                 uniqueItems: true
 *                 items:
 *                   type: string
 *                   pattern: '^[a-fA-F0-9]{24}$'
 *               quietHours:
 *                 type: object
 *                 required: [enabled, start, end, timeZone]
 *                 properties:
 *                   enabled:
 *                     type: boolean
 *                   start:
 *                     type: string
 *                     pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 *                     example: "22:00"
 *                   end:
 *                     type: string
 *                     pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 *                     example: "07:00"
 *                   timeZone:
 *                     type: string
 *                     example: America/New_York
 *     responses:
 *       200:
 *         description: Updated notification preferences
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotificationPreferences'
 *       400:
 *         description: Invalid preference values
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.put("/preferences", updateNotificationPreferences);

/**
 * @swagger
 * /api/notifications/device-token:
 *   post:
 *     tags: [Notifications]
 *     summary: Register a device push token
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *                 maxLength: 200
 *                 pattern: '^(Expo|Exponent)PushToken\\[[^\\]]+\\]$'
 *               platform:
 *                 type: string
 *                 enum: [ios, android, unknown]
 *                 default: unknown
 *     responses:
 *       200:
 *         description: Device token registered
 *       400:
 *         description: Invalid Expo push token or platform
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post("/device-token", registerPushToken);

/**
 * @swagger
 * /api/notifications/device-token:
 *   delete:
 *     tags: [Notifications]
 *     summary: Unregister a device push token
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *                 maxLength: 200
 *     responses:
 *       200:
 *         description: Device token unregistered
 *       400:
 *         description: Invalid push token
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.delete("/device-token", unregisterPushToken);

export default router;
