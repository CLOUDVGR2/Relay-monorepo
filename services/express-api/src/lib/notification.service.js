import User from "../models/user.model.js";
import Notification from "../models/notification.model.js";
import NotificationSettings from "../models/notification-settings.model.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function isWithinQuietHours(quietHours, now = new Date()) {
  if (!quietHours?.enabled) return false;

  const { start, end, timeZone } = quietHours;
  if (!start || !end || !timeZone || start === end) return false;

  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);

    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    const current = hour * 60 + minute;
    const startMinutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3));
    const endMinutes = Number(end.slice(0, 2)) * 60 + Number(end.slice(3));

    // Handles both normal daytime intervals and intervals crossing midnight.
    return startMinutes < endMinutes
      ? current >= startMinutes && current < endMinutes
      : current >= startMinutes || current < endMinutes;
  } catch {
    // Invalid stored timezone configuration must not break message delivery.
    return false;
  }
}

async function sendExpoPush(settings, notification, senderId) {
  if (!settings || !settings.pushEnabled || settings.pushTokens.length === 0) {
    return;
  }

  if (
    settings.mutedConversationIds.some(
      (id) => String(id) === String(senderId),
    )
  ) {
    return;
  }

  if (isWithinQuietHours(settings.quietHours)) return;

  const tokens = settings.pushTokens.map((item) => item.token);
  const messages = tokens.map((to) => ({
    to,
    sound: "default",
    title: notification.title,
    body: notification.body,
    data: {
      type: "message",
      conversationUserId: String(senderId),
      messageId: String(notification.messageId ?? ""),
    },
  }));

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error("Expo push request failed with status:", response.status);
      return;
    }

    const result = await response.json();
    const tickets = result.data ?? [];

    tickets.forEach((ticket, index) => {
      if (ticket?.status === "error") {
        console.error("Expo push ticket error:", {
          index,
          error: ticket.message ?? "Unknown Expo ticket error",
          code: ticket.details?.error ?? "UnknownError",
        });
      }
    });

    // Remove tokens that Expo has explicitly identified as unregistered.
    const invalidTokens = tickets.flatMap((ticket, index) =>
      ticket?.details?.error === "DeviceNotRegistered" ? [tokens[index]] : [],
    );

    if (invalidTokens.length > 0) {
      await NotificationSettings.updateOne(
        { _id: settings._id },
        { $pull: { pushTokens: { token: { $in: invalidTokens } } } },
      );
    }
  } catch (error) {
    // Push is best-effort; it must never fail the message send.
    console.error("Expo push delivery failed:", error.message);
  }
}

export async function createMessageNotification({ senderId, receiverId, message }) {
  const sender = await User.findById(senderId).select("fullName").lean();

  const senderName = sender?.fullName || "New message";
  const messageText =
    typeof message.text === "string" && message.text.trim()
      ? message.text.trim()
      : "Sent you an image";

  const notification = await Notification.create({
    userId: receiverId,
    type: "message",
    title: senderName.slice(0, 120),
    body: messageText.slice(0, 500),
    conversationUserId: senderId,
    messageId: message._id,
  });

  try {
    const settings = await NotificationSettings.findOne({
      userId: receiverId,
    });

    await sendExpoPush(settings, notification, senderId);
  } catch (error) {
    console.error("Notification push preparation failed:", error.message);
  }

  return notification;
}
