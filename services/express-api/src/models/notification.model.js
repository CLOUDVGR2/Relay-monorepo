import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["message", "mention"],
      default: "message",
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 120,
    },
    body: {
      type: String,
      required: true,
      maxlength: 500,
    },
    conversationUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, createdAt: -1, _id: -1 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
