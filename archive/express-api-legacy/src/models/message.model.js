/** Domain or persistence model for message model in the Relay archived legacy Express implementation. */

import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      validate: {
        validator(receiverId) {
          // Allow validation to proceed when a required field is missing.
          if (!this.senderId || !receiverId) return true;

          return !this.senderId.equals(receiverId);
        },
        message: "Sender and receiver must be different users",
      },
    },

    text: {
      type: String,
      trim: true,
      default: "",
      maxlength: [5000, "Message text cannot exceed 5000 characters"],
    },

    image: {
      type: String,
      default: "",
      maxlength: [2048, "Image URL is too long"],
      validate: {
        validator(value) {
          // An empty image is valid for text-only messages.
          if (!value) return true;

          try {
            const url = new URL(value);
            return url.protocol === "https:";
          } catch {
            return false;
          }
        },
        message: "Image must be a valid HTTPS URL",
      },
    },
  },
  {
    timestamps: true,
  },
);

// Support conversation queries in both sender/receiver directions.
messageSchema.index(
  { senderId: 1, receiverId: 1, createdAt: 1, _id: 1 },
  { name: "conversation_sender_receiver_time" },
);

messageSchema.index(
  { receiverId: 1, senderId: 1, createdAt: 1, _id: 1 },
  { name: "conversation_receiver_sender_time" },
);

// Enforce the invariant that every message contains text, an image, or both.
messageSchema.pre("validate", function () {
  if (!this.text?.trim() && !this.image?.trim()) {
    this.invalidate("text", "A message must contain text or an image");
  }
});

const Message = mongoose.model("Message", messageSchema);

export default Message;
