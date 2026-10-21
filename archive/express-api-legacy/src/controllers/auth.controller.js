/** Request controllers for auth controller in the Relay archived legacy Express implementation. */

import { generateToken, clearAuthCookie } from "../lib/utils.js";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import cloudinary from "../lib/cloudinary.js";
import { validateImageDataUri } from "../lib/image-data-uri.js";

// Register a new user and establish an authenticated session.
export const signup = async (req, res) => {
  try {
    // Read the submitted fields safely.
    const { fullName, email, password } = req.body ?? {};

    // Validate required fields before performing database operations.
    if (
      typeof fullName !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !fullName.trim() ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    // Normalize values before checking or storing them.
    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    // Enforce reasonable input limits and a basic email format.
    if (normalizedName.length > 100) {
      return res.status(400).json({
        message: "Full name is too long",
      });
    }

    if (
      normalizedEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      return res.status(400).json({
        message: "Invalid email address",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    // bcrypt only uses the first 72 bytes of a password.
    // Reject longer UTF-8 passwords instead of silently truncating them.
    if (Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({
        message: "Password must not exceed 72 bytes",
      });
    }

    // Provide a friendly response for an already registered email.
    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Email already exists",
      });
    }

    // Hash the password before storing it.
    const hashedPassword = await bcrypt.hash(password, 12);

    // Construct the user document with normalized values.
    const newUser = new User({
      fullName: normalizedName,
      email: normalizedEmail,
      password: hashedPassword,
    });

    // Persist the user before issuing an authentication token.
    await newUser.save();

    // Issue the JWT only after the database save succeeds.
    generateToken(newUser._id, res);

    // Return only public user fields.
    return res.status(201).json({
      _id: newUser._id,
      fullName: newUser.fullName,
      email: newUser.email,
      profilePic: newUser.profilePic,
    });
  } catch (error) {
    // Handle duplicate-key errors from MongoDB's unique index.
    if (error.code === 11000) {
      return res.status(409).json({
        message: "Email already exists",
      });
    }

    console.error("Signup failed:", error.message);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// Authenticate an existing user and issue a JWT cookie.
export const login = async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    // Reject missing or incorrectly typed credentials.
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    // Normalize email consistently with signup.
    const normalizedEmail = email.trim().toLowerCase();

    // Explicitly retrieve the password hash because the User schema
    // excludes it from query results by default.
    const user = await User.findOne({
      email: normalizedEmail,
    }).select("+password");

    // Use the same response for unknown emails and incorrect passwords.
    if (!user) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    // Set the authentication cookie after successful verification.
    generateToken(user._id, res);

    // Return only public user fields.
    return res.status(200).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      profilePic: user.profilePic,
    });
  } catch (error) {
    console.error("Login failed:", error.message);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// Clear the authentication cookie and end the client session.
export const logout = (req, res) => {
  try {
    // Reuse the shared helper to preserve the cookie's name and scope.
    clearAuthCookie(res);

    return res.status(200).json({
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout failed:", error.message);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// Upload a new profile image for the authenticated user.
export const updateProfile = async (req, res) => {
  try {
    const { fullName, profilePic } = req.body ?? {};
    const userId = req.user._id;

    const updates = {};

    // Update the name only when the client provides it.
    if (fullName !== undefined) {
      if (typeof fullName !== "string" || !fullName.trim()) {
        return res.status(400).json({
          message: "Full name must be a non-empty string",
        });
      }

      updates.fullName = fullName.trim();
    }

    // Upload a new profile picture only when one is provided.
    if (profilePic !== undefined) {
      if (typeof profilePic !== "string" || !profilePic.trim()) {
        return res.status(400).json({
          message: "Profile picture must be a non-empty string",
        });
      }

      const imageValidation = validateImageDataUri(profilePic);

      if (imageValidation === "too_large") {
        return res.status(413).json({
          message: "Profile pictures must not exceed 7 MiB",
        });
      }

      if (imageValidation) {
        return res.status(400).json({
          message: "Profile picture must be a supported Base64 image data URI",
        });
      }

      const uploadResponse = await cloudinary.uploader.upload(profilePic, {
        resource_type: "image",
      });

      updates.profilePic = uploadResponse.secure_url;
    }

    // Reject requests that contain no supported updates.
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: "Provide a full name or profile picture to update",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      {
        new: true,
        runValidators: true,
      },
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json(updatedUser);
  } catch (error) {
    console.error("Profile update failed:", error.message);

    return res.status(500).json({
      message: "Unable to update profile",
    });
  }
};

// Return the authenticated user's information.
export const checkAuth = (req, res) => {
  // protectRoute middleware is responsible for authenticating
  // the request and attaching the user to req.user.
  return res.status(200).json(req.user);
};
