/** Domain or persistence model for user model in the Relay archived legacy Express implementation. */

import mongoose from "mongoose";

// Define validation and storage rules for user accounts.
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [254, "Email address is too long"],
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please provide a valid email address",
      ],
    },

    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      maxlength: [100, "Full name is too long"],
    },

    password: {
      // The authentication controller must hash passwords before storage.
      type: String,
      required: [true, "Password hash is required"],
      select: false,
    },

    profilePic: {
      type: String,
      default: "",
      trim: true,
      maxlength: [2048, "Profile picture URL is too long"],
      validate: {
        validator(value) {
          // An empty string means the user has no profile picture.
          if (!value) return true;

          try {
            const url = new URL(value);
            return url.protocol === "https:";
          } catch {
            return false;
          }
        },
        message: "Profile picture must be a valid HTTPS URL",
      },
    },
  },
  {
    timestamps: true,
  },
);

// The unique email index is declared through unique: true above.
const User = mongoose.model("User", userSchema);

export default User;
