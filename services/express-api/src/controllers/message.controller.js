/** Request controllers for message controller in the Relay Express API. */

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

// Retrieve a bounded, cursor-paginated conversation in chronological order.
export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    // Reject malformed recipient IDs before querying MongoDB.
    if (!mongoose.isValidObjectId(userToChatId)) {
      return res.status(400).json({
        message: "Invalid recipient ID",
      });
    }

    const recipient = await User.exists({ _id: userToChatId });
    if (!recipient) {
      return res.status(404).json({ message: "User not found" });
    }

    // Keep each response bounded so large conversations cannot force unbounded
    // database work, network transfer, or client-side memory allocation.
    let limit = 50;
    if (req.query.limit !== undefined) {
      if (typeof req.query.limit !== "string" || !/^\d+$/.test(req.query.limit)) {
        return res.status(400).json({ message: "Invalid message page limit" });
      }
      limit = Number(req.query.limit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        return res.status(400).json({ message: "Message page limit must be between 1 and 100" });
      }
    }

    const conversationFilter = {
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    };
    let query = conversationFilter;

    // Cursor encodes the timestamp and ObjectId so pagination remains stable
    // when multiple messages share a timestamp.
    if (req.query.before !== undefined) {
      if (typeof req.query.before !== "string" || req.query.before.length > 1024) {
        return res.status(400).json({ message: "Invalid message cursor" });
      }

      let cursor;
      try {
        cursor = JSON.parse(Buffer.from(req.query.before, "base64url").toString("utf8"));
      } catch {
        return res.status(400).json({ message: "Invalid message cursor" });
      }

      const cursorDate = new Date(cursor?.createdAt);
      if (
        !cursor ||
        !mongoose.isValidObjectId(cursor.id) ||
        !Number.isFinite(cursorDate.getTime())
      ) {
        return res.status(400).json({ message: "Invalid message cursor" });
      }

      query = {
        $and: [
          conversationFilter,
          {
            $or: [
              { createdAt: { $lt: cursorDate } },
              { createdAt: cursorDate, _id: { $lt: cursor.id } },
            ],
          },
        ],
      };
    }

    // Read newest-first for an efficient bounded page, then reverse only the
    // selected page for the chronological order expected by the web and mobile clients.
    const fetched = await Message.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean()
      .exec();

    const hasMore = fetched.length > limit;
    const page = fetched.slice(0, limit);
    const oldestMessage = page[page.length - 1];

    res.set("Cache-Control", "no-store");
    res.set("X-Has-More", String(hasMore));
    if (hasMore && oldestMessage) {
      res.set(
        "X-Next-Cursor",
        Buffer.from(JSON.stringify({
          createdAt: new Date(oldestMessage.createdAt).toISOString(),
          id: String(oldestMessage._id),
        })).toString("base64url"),
      );
    }

    return res.status(200).json(page.reverse());
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
