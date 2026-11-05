-- Track per-user conversation visibility without deleting shared history.
ALTER TABLE "conversation_participants"
ADD COLUMN "hiddenAt" TIMESTAMP(3);
