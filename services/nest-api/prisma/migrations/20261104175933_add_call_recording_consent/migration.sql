-- AlterTable
ALTER TABLE "call_participants" ADD COLUMN     "recordingConsent" BOOLEAN,
ADD COLUMN     "recordingConsentAt" TIMESTAMP(3);
