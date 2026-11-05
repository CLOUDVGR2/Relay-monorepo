-- Allow only one ringing or active call per conversation and media type.
-- AUDIO and VIDEO remain independent; ended and cancelled calls remain in history.
CREATE UNIQUE INDEX "call_sessions_one_open_call_per_conversation_type"
ON "call_sessions" ("conversationId", "type")
WHERE "status" IN ('RINGING', 'ACTIVE');
