-- Restrict calls to audio while preserving all call sessions and participants.
-- Abort before changing data only if converting an open VIDEO call to
-- AUDIO would collide with an already-open AUDIO call in the same conversation.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "call_sessions" AS audio_call
    JOIN "call_sessions" AS video_call
      ON video_call."conversationId" = audio_call."conversationId"
    WHERE audio_call."type"::text = 'AUDIO'
      AND video_call."type"::text = 'VIDEO'
      AND audio_call."status" IN ('RINGING', 'ACTIVE')
      AND video_call."status" IN ('RINGING', 'ACTIVE')
  ) THEN
    RAISE EXCEPTION
      'Audio-only migration blocked: a conversation has both an open AUDIO call and an open VIDEO call. Resolve those conflicts explicitly before retrying.';
  END IF;
END
$$;

-- Historical video calls remain in history, represented as audio calls.
UPDATE "call_sessions"
SET "type" = 'AUDIO'
WHERE "type"::text = 'VIDEO';

-- Only call_sessions.type depends on this enum (verified in migration history).
CREATE TYPE "CallType_new" AS ENUM ('AUDIO');

ALTER TABLE "call_sessions"
  ALTER COLUMN "type" TYPE "CallType_new"
  USING ("type"::text::"CallType_new");

DROP TYPE "CallType";
ALTER TYPE "CallType_new" RENAME TO "CallType";
