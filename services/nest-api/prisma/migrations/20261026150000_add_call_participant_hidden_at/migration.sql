-- Add per-user soft deletion for call history.
ALTER TABLE "call_participants"
ADD COLUMN "hiddenAt" TIMESTAMP(3);
