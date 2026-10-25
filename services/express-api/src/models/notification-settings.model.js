import mongoose from "mongoose";

const notificationSettingsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    pushEnabled: {
      type: Boolean,
      default: true,
    },
    pushTokens: {
      type: [
        {
          token: { type: String, required: true, maxlength: 200 },
          platform: {
            type: String,
            enum: ["ios", "android", "unknown"],
            default: "unknown",
          },
          updatedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    mutedConversationIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      default: [],
    },
    quietHours: {
      enabled: { type: Boolean, default: false },
      start: { type: String, default: "22:00" },
      end: { type: String, default: "08:00" },
      timeZone: { type: String, default: "UTC", maxlength: 100 },
    },
  },
  { timestamps: true },
);

const NotificationSettings = mongoose.model(
  "NotificationSettings",
  notificationSettingsSchema,
);

export default NotificationSettings;
