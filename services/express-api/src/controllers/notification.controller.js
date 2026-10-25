import mongoose from "mongoose";
import Notification from "../models/notification.model.js";
import NotificationSettings from "../models/notification-settings.model.js";

const userIdFrom = (req) => req.user._id;

const validClockTime = (value) =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const validTimeZone = (value) => {
  if (typeof value !== "string" || value.length > 100) return false;

  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const getOrCreateSettings = (userId) =>
  NotificationSettings.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { new: true, upsert: true, runValidators: true },
  );

export async function listNotifications(req, res) {
  try {
    const requestedLimit =
      req.query.limit === undefined ? 30 : Number(req.query.limit);

    if (
      !Number.isInteger(requestedLimit) ||
      requestedLimit < 1 ||
      requestedLimit > 100
    ) {
      return res
        .status(400)
        .json({ message: "Limit must be between 1 and 100" });
    }

    const notifications = await Notification.find({ userId: userIdFrom(req) })
      .sort({ createdAt: -1, _id: -1 })
      .limit(requestedLimit)
      .lean();

    const unreadCount = await Notification.countDocuments({
      userId: userIdFrom(req),
      readAt: null,
    });

    return res.status(200).json({ notifications, unreadCount });
  } catch (error) {
    console.error("listNotifications failed:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function markNotificationRead(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid notification ID" });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId: userIdFrom(req) },
      { $set: { readAt: new Date() } },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.status(200).json({ notification });
  } catch (error) {
    console.error("markNotificationRead failed:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function markAllNotificationsRead(req, res) {
  try {
    await Notification.updateMany(
      { userId: userIdFrom(req), readAt: null },
      { $set: { readAt: new Date() } },
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("markAllNotificationsRead failed:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function getNotificationPreferences(req, res) {
  try {
    const settings = await getOrCreateSettings(userIdFrom(req));

    return res.status(200).json({
      pushEnabled: settings.pushEnabled,
      mutedConversationIds: settings.mutedConversationIds.map(String),
      quietHours: settings.quietHours,
    });
  } catch (error) {
    console.error("getNotificationPreferences failed:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateNotificationPreferences(req, res) {
  try {
    const body = req.body ?? {};
    const update = {};

    if (body.pushEnabled !== undefined) {
      if (typeof body.pushEnabled !== "boolean") {
        return res
          .status(400)
          .json({ message: "pushEnabled must be a boolean" });
      }
      update.pushEnabled = body.pushEnabled;
    }

    if (body.mutedConversationIds !== undefined) {
      if (
        !Array.isArray(body.mutedConversationIds) ||
        body.mutedConversationIds.length > 500 ||
        body.mutedConversationIds.some((id) => !mongoose.isValidObjectId(id))
      ) {
        return res
          .status(400)
          .json({ message: "Invalid muted conversation IDs" });
      }

      update.mutedConversationIds = [
        ...new Set(body.mutedConversationIds.map(String)),
      ];
    }

    if (body.quietHours !== undefined) {
      const quiet = body.quietHours;

      if (
        !quiet ||
        typeof quiet !== "object" ||
        Array.isArray(quiet) ||
        typeof quiet.enabled !== "boolean" ||
        !validClockTime(quiet.start) ||
        !validClockTime(quiet.end) ||
        !validTimeZone(quiet.timeZone)
      ) {
        return res.status(400).json({
          message:
            "quietHours requires enabled, valid start/end times, and a valid IANA timeZone",
        });
      }

      update.quietHours = {
        enabled: quiet.enabled,
        start: quiet.start,
        end: quiet.end,
        timeZone: quiet.timeZone,
      };
    }

    const settings = await NotificationSettings.findOneAndUpdate(
      { userId: userIdFrom(req) },
      { $set: update, $setOnInsert: { userId: userIdFrom(req) } },
      { new: true, upsert: true, runValidators: true },
    );

    return res.status(200).json({
      pushEnabled: settings.pushEnabled,
      mutedConversationIds: settings.mutedConversationIds.map(String),
      quietHours: settings.quietHours,
    });
  } catch (error) {
    console.error("updateNotificationPreferences failed:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function registerPushToken(req, res) {
  try {
    const { token, platform = "unknown" } = req.body ?? {};

    if (
      typeof token !== "string" ||
      token.length > 200 ||
      !/^(Expo|Exponent)PushToken\[[^\]]+\]$/.test(token)
    ) {
      return res.status(400).json({ message: "Invalid Expo push token" });
    }

    if (!["ios", "android", "unknown"].includes(platform)) {
      return res.status(400).json({ message: "Invalid device platform" });
    }

    const userId = userIdFrom(req);
    const settings = await getOrCreateSettings(userId);

    // A token can be refreshed; update its platform and timestamp rather than
    // storing duplicate copies for the same account.
    settings.pushTokens = settings.pushTokens.filter(
      (item) => item.token !== token,
    );
    settings.pushTokens.push({ token, platform, updatedAt: new Date() });

    // Keep a bounded list of recently registered devices.
    settings.pushTokens = settings.pushTokens.slice(-10);
    await settings.save();

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("registerPushToken failed:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function unregisterPushToken(req, res) {
  try {
    const { token } = req.body ?? {};

    if (typeof token !== "string" || token.length > 200) {
      return res.status(400).json({ message: "Invalid push token" });
    }

    await NotificationSettings.updateOne(
      { userId: userIdFrom(req) },
      { $pull: { pushTokens: { token } } },
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("unregisterPushToken failed:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}
