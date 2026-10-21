/** Domain or persistence model for ai execution model in the Relay Express API. */

import mongoose from "mongoose";

const aiExecutionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    operation: {
      type: String,
      enum: ["answer"],
      default: "answer",
      required: true,
    },
    status: {
      type: String,
      enum: ["running", "succeeded", "failed"],
      default: "running",
      required: true,
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    durationMs: {
      type: Number,
      min: 0,
      default: null,
    },
    errorCategory: {
      type: String,
      enum: [
        "timeout",
        "service_unavailable",
        "upstream_error",
        "internal_error",
      ],
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

aiExecutionSchema.index(
  { userId: 1, createdAt: -1 },
  { name: "ai_execution_user_recent" },
);

const AiExecution = mongoose.model("AiExecution", aiExecutionSchema);

export default AiExecution;
