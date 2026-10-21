/** Request controllers for message controller in the Relay archived legacy Express implementation. */

import mongoose from "mongoose";

import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import cloudinary from "../lib/cloudinary.js";
import { getUserRoom, io } from "../lib/socket.js";
import { validateImageDataUri } from "../lib/image-data-uri.js";

// Retrieve all users except the authenticated user for the sidebar.
export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    const users = await User.find({
      _id: { $ne: loggedInUserId },
    })
      .select("-password")
      .sort({ fullName: 1, _id: 1 })
      .lean();

    return res.status(200).json(users);
  } catch (error) {
    console.error("getUsersForSidebar failed:", error.message);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// Retrieve messages exchanged between the authenticated user and another user.
export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;
    const limitValue = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(limitValue)
      ? Math.min(Math.max(limitValue, 1), 50)
      : 50;
    const beforeId = req.query.before;

    if (!mongoose.isValidObjectId(userToChatId)) {
      return res.status(400).json({
        message: "Invalid recipient ID",
      });
    }

    if (beforeId !== undefined && !mongoose.isValidObjectId(beforeId)) {
      return res.status(400).json({
        message: "Invalid message cursor",
      });
    }

    const recipient = await User.exists({ _id: userToChatId });

    if (!recipient) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const conversationFilter = {
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    };

    let queryFilter = conversationFilter;

    if (beforeId) {
      const cursorMessage = await Message.findOne({
        _id: beforeId,
        ...conversationFilter,
      })
        .select("_id createdAt")
        .lean();

      if (!cursorMessage) {
        return res.status(400).json({
          message: "Invalid message cursor for this conversation",
        });
      }

      queryFilter = {
        $and: [
          conversationFilter,
          {
            $or: [
              { createdAt: { $lt: cursorMessage.createdAt } },
              {
                createdAt: cursorMessage.createdAt,
                _id: { $lt: cursorMessage._id },
              },
            ],
          },
        ],
      };
    }

    // Fetch newest first so the database can stop after limit + 1 records.
    const results = await Message.find(queryFilter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = results.length > limit;
    const page = results.slice(0, limit);
    const messages = page.reverse();

    res.set("X-Has-More", String(hasMore));

    if (hasMore && messages.length > 0) {
      res.set("X-Next-Cursor", String(messages[0]._id));
    }

    return res.status(200).json(messages);
  } catch (error) {
    console.error("getMessages failed:", error.message);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// Save a message and deliver it to the recipient's active connections.
export const sendMessage = async (req, res) => {
  try {
    const { id: receiverId } = req.params;
    const { text, image } = req.body ?? {};
    const senderId = req.user._id;

    // Reject malformed recipient IDs before database or upload operations.
    if (!mongoose.isValidObjectId(receiverId)) {
      return res.status(400).json({
        message: "Invalid recipient ID",
      });
    }

    // Prevent sending messages to nonexistent accounts.
    const recipient = await User.exists({ _id: receiverId });

    if (!recipient) {
      return res.status(404).json({
        message: "Recipient not found",
      });
    }

    // Validate text without preventing image-only messages.
    if (text !== undefined && typeof text !== "string") {
      return res.status(400).json({
        message: "Message text must be a string",
      });
    }

    if (typeof text === "string" && text.length > 5000) {
      return res.status(400).json({
        message: "Message text must not exceed 5000 characters",
      });
    }

    // Validate the image payload before sending it to Cloudinary.
    if (image !== undefined && typeof image !== "string") {
      return res.status(400).json({
        message: "Image must be a valid image payload",
      });
    }

    if (image !== undefined) {
      const imageValidation = validateImageDataUri(image);

      if (imageValidation === "too_large") {
        return res.status(413).json({
          message: "Images must not exceed 7 MiB",
        });
      }

      if (imageValidation) {
        return res.status(400).json({
          message: "Image must be a supported Base64 image data URI",
        });
      }
    }

    const normalizedText = typeof text === "string" ? text.trim() : "";

    // A message must contain text, an image, or both.
    if (!normalizedText && !image) {
      return res.status(400).json({
        message: "A message must contain text or an image",
      });
    }

    let imageUrl;

    if (image) {
      // Upload the image and store only its hosted URL in MongoDB.
      const uploadResponse = await cloudinary.uploader.upload(image, {
        resource_type: "image",
      });

      imageUrl = uploadResponse.secure_url;
    }

    // Persist the message before notifying the recipient.
    const newMessage = await Message.create({
      senderId,
      receiverId,
      text: normalizedText,
      image: imageUrl,
    });

    // Deliver to the recipient's private room, including every active tab.
    // The room name is based on the validated recipient ID.
    io.to(getUserRoom(receiverId)).emit("newMessage", newMessage);

    return res.status(201).json(newMessage);
  } catch (error) {
    console.error("sendMessage failed:", error.message);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
