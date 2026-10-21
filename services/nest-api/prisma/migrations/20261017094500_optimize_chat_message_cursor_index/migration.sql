-- Database migration for nest api; review locking and compatibility before deployment.

CREATE INDEX "chat_messages_conversationId_createdAt_id_idx"
ON "chat_messages" ("conversationId", "createdAt" DESC, "id" DESC);

DROP INDEX "chat_messages_conversationId_createdAt_idx";
