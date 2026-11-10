-- CreateEnum
CREATE TYPE "CallRecordingUploadStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED');

-- CreateTable
CREATE TABLE "call_recording_uploads" (
    "id" UUID NOT NULL,
    "recordingId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "kind" "CallAudioTrackKind" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "status" "CallRecordingUploadStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_recording_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "call_recording_uploads_objectKey_key" ON "call_recording_uploads"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "call_recording_uploads_recordingId_kind_key" ON "call_recording_uploads"("recordingId", "kind");

-- CreateIndex
CREATE INDEX "call_recording_uploads_participantId_status_idx" ON "call_recording_uploads"("participantId", "status");

-- CreateIndex
CREATE INDEX "call_recording_uploads_status_expiresAt_idx" ON "call_recording_uploads"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "call_recording_uploads" ADD CONSTRAINT "call_recording_uploads_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "call_recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_recording_uploads" ADD CONSTRAINT "call_recording_uploads_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "call_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
