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
      enum: ["message", "mention", "incoming_call"],
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
    callId: {
      type: String,
      maxlength: 36,
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
notificationSchema.index(
  { userId: 1, callId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "incoming_call",
      callId: { $type: "string" },
    },
  },
);

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
