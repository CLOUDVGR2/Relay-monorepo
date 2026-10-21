/** Data access and persistence integration for the Relay archived legacy Express implementation. */

import mongoose from "mongoose";

export const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is not configured");
  }

  try {
    const conn = await mongoose.connect(mongoUri);

    console.log(`MongoDB connected: ${conn.connection.host}`);

    return conn;
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);

    // Let the application startup handler know that startup failed.
    throw error;
  }
};
