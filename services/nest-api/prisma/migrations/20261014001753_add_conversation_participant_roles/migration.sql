-- CreateEnum
CREATE TYPE "ConversationParticipantRole" AS ENUM ('ADMIN', 'MEMBER');

-- AlterTable
ALTER TABLE "conversation_participants" ADD COLUMN     "role" "ConversationParticipantRole" NOT NULL DEFAULT 'MEMBER';
