-- CreateEnum
CREATE TYPE "CallRecordingStatus" AS ENUM ('PENDING', 'UPLOADING', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "CallAudioTrackKind" AS ENUM ('LOCAL_MICROPHONE', 'REMOTE_PARTICIPANT');

-- CreateEnum
CREATE TYPE "CallTranscriptStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CallSummaryStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CallProcessingJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "call_recordings" (
    "id" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "status" "CallRecordingStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_recording_tracks" (
    "id" UUID NOT NULL,
    "recordingId" UUID NOT NULL,
    "kind" "CallAudioTrackKind" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'audio/pcm',
    "sampleRate" INTEGER NOT NULL,
    "channels" INTEGER NOT NULL,
    "sampleCount" BIGINT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_recording_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_transcripts" (
    "id" UUID NOT NULL,
    "trackId" UUID NOT NULL,
    "status" "CallTranscriptStatus" NOT NULL DEFAULT 'QUEUED',
    "text" TEXT,
    "language" TEXT,
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_summaries" (
    "id" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "status" "CallSummaryStatus" NOT NULL DEFAULT 'QUEUED',
    "summary" TEXT,
    "keyPoints" JSONB,
    "actionItems" JSONB,
    "failureCode" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_processing_jobs" (
    "id" UUID NOT NULL,
    "recordingId" UUID NOT NULL,
    "status" "CallProcessingJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "leaseToken" TEXT,
    "lastErrorCode" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "call_recordings_callId_key" ON "call_recordings"("callId");

-- CreateIndex
CREATE INDEX "call_recordings_status_createdAt_idx" ON "call_recordings"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "call_recording_tracks_objectKey_key" ON "call_recording_tracks"("objectKey");

-- CreateIndex
CREATE INDEX "call_recording_tracks_recordingId_idx" ON "call_recording_tracks"("recordingId");

-- CreateIndex
CREATE UNIQUE INDEX "call_recording_tracks_recordingId_kind_key" ON "call_recording_tracks"("recordingId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "call_transcripts_trackId_key" ON "call_transcripts"("trackId");

-- CreateIndex
CREATE UNIQUE INDEX "call_summaries_callId_key" ON "call_summaries"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "call_processing_jobs_recordingId_key" ON "call_processing_jobs"("recordingId");

-- CreateIndex
CREATE INDEX "call_processing_jobs_status_availableAt_idx" ON "call_processing_jobs"("status", "availableAt");

-- AddForeignKey
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_callId_fkey" FOREIGN KEY ("callId") REFERENCES "call_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_recording_tracks" ADD CONSTRAINT "call_recording_tracks_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "call_recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "call_recording_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_summaries" ADD CONSTRAINT "call_summaries_callId_fkey" FOREIGN KEY ("callId") REFERENCES "call_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_processing_jobs" ADD CONSTRAINT "call_processing_jobs_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "call_recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

