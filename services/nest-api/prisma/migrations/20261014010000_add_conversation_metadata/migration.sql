-- Add optional metadata for group conversations.
ALTER TABLE "conversations"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "description" TEXT;
