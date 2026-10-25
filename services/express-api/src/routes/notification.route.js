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

router.get("/", listNotifications);
router.patch("/read-all", markAllNotificationsRead);
router.patch("/:id/read", markNotificationRead);

router.get("/preferences", getNotificationPreferences);
router.put("/preferences", updateNotificationPreferences);

router.post("/device-token", registerPushToken);
router.delete("/device-token", unregisterPushToken);

export default router;
