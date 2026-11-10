import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CallAudioTrackKind,
  CallParticipantStatus,
  CallRecordingStatus,
  CallRecordingUploadStatus,
  CallStatus,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CallRecordingStorageService } from './call-recording-storage.service.js';
import {
  CallRecordingUploadsService,
  type CompleteRecordingUploadInput,
} from './call-recording-uploads.service.js';

describe('CallRecordingUploadsService', () => {
  const callId = '22222222-2222-4222-8222-222222222222';
  const recordingId = '33333333-3333-4333-8333-333333333333';
  const initiatorId = '507f1f77bcf86cd799439011';
  const inviteeId = '507f191e810c19729de860ea';
  const initiatorParticipantId = '44444444-4444-4444-8444-444444444444';
  const inviteeParticipantId = '55555555-5555-4555-8555-555555555555';
  const uploadId = '66666666-6666-4666-8666-666666666666';

  const participants = () => [
    {
      id: initiatorParticipantId,
      callId,
      userId: initiatorId,
      status: CallParticipantStatus.ACCEPTED,
      recordingConsent: true,
    },
    {
      id: inviteeParticipantId,
      callId,
      userId: inviteeId,
      status: CallParticipantStatus.ACCEPTED,
      recordingConsent: true,
    },
  ];

  const activeCall = () => ({
    id: callId,
    initiatorId,
    status: CallStatus.ACTIVE,
    participants: participants(),
  });

  const recording = () => ({
    id: recordingId,
    callId,
  });

  const pendingUpload = () => ({
    id: uploadId,
    recordingId,
    participantId: initiatorParticipantId,
    kind: CallAudioTrackKind.LOCAL_MICROPHONE,
    objectKey: `call-recordings/${callId}/${recordingId}/${uploadId}.wav`,
    status: CallRecordingUploadStatus.PENDING,
    createdAt: new Date('2026-11-05T18:00:00Z'),
    participant: participants()[0],
    recording: {
      id: recordingId,
      callId,
      call: {
        id: callId,
        status: CallStatus.ACTIVE as CallStatus,
        endedAt: null as Date | null,
        participants: participants(),
      },
    },
  });

  const validInput = (): CompleteRecordingUploadInput => ({
    contentType: 'audio/wav',
    sampleRate: 48_000,
    channels: 1,
    sampleCount: '48000',
    durationMs: 1000,
    byteSize: 2048,
    sha256: 'a'.repeat(64),
  });

  const transaction = {
    $queryRaw: vi.fn(),
    callRecordingUpload: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    callRecordingTrack: {
      create: vi.fn(),
      count: vi.fn(),
    },
    callRecording: {
      update: vi.fn(),
    },
    callProcessingJob: {
      upsert: vi.fn(),
    },
  };

  const prisma = {
    callSession: {
      findFirst: vi.fn(),
    },
    callRecording: {
      upsert: vi.fn(),
    },
    callRecordingUpload: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    callRecordingTrack: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const storage = {
    createUploadUrl: vi.fn(),
    createDownloadUrl: vi.fn(),
    verifyObject: vi.fn(),
    deleteObject: vi.fn(),
  };

  let service: CallRecordingUploadsService;

  beforeEach(() => {
    vi.resetAllMocks();

    service = new CallRecordingUploadsService(
      prisma as unknown as PrismaService,
      storage as unknown as CallRecordingStorageService,
    );

    prisma.callSession.findFirst.mockResolvedValue(activeCall());
    prisma.callRecording.upsert.mockResolvedValue(recording());
    transaction.callRecordingUpload.findUnique.mockResolvedValue(null);
    transaction.callRecordingUpload.create.mockImplementation(
      async ({ data }) => ({
        ...data,
        status: CallRecordingUploadStatus.PENDING,
      }),
    );
    transaction.callRecordingUpload.update.mockImplementation(
      async ({ data }) => ({
        ...pendingUpload(),
        ...data,
      }),
    );

    storage.createUploadUrl.mockResolvedValue({
      uploadUrl: 'https://storage.example/upload',
      expiresIn: 300,
    });
    storage.createDownloadUrl.mockResolvedValue({
      downloadUrl: 'https://storage.example/download',
      expiresIn: 300,
    });

    prisma.callRecordingUpload.findFirst.mockResolvedValue(pendingUpload());
    storage.verifyObject.mockResolvedValue({
      contentLength: 2048,
      contentType: 'audio/wav',
      etag: '"test-etag"',
    });

    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );

    transaction.$queryRaw.mockResolvedValue([]);
    transaction.callRecordingUpload.updateMany.mockResolvedValue({
      count: 1,
    });
    transaction.callRecordingTrack.create.mockResolvedValue({
      id: '77777777-7777-4777-8777-777777777777',
    });
    transaction.callRecordingTrack.count.mockResolvedValue(1);
    transaction.callRecording.update.mockResolvedValue({});
  });

  describe('createUpload', () => {
    it('creates an initiator LOCAL_MICROPHONE upload', async () => {
      const result = await service.createUpload(callId, initiatorId);

      expect(result).toMatchObject({
        uploadId: expect.any(String),
        uploadUrl: 'https://storage.example/upload',
        expiresIn: 300,
        contentType: 'audio/wav',
      });

      expect(transaction.callRecordingUpload.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          recordingId,
          participantId: initiatorParticipantId,
          kind: CallAudioTrackKind.LOCAL_MICROPHONE,
          objectKey: expect.stringContaining('.wav'),
        }),
      });

      expect(storage.createUploadUrl).toHaveBeenCalledWith(
        expect.stringContaining('.wav'),
        'audio/wav',
      );
    });

    it('assigns REMOTE_PARTICIPANT to the invitee', async () => {
      await service.createUpload(callId, inviteeId);

      expect(transaction.callRecordingUpload.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          participantId: inviteeParticipantId,
          kind: CallAudioTrackKind.REMOTE_PARTICIPANT,
        }),
      });
    });

    it('rejects a call without both participants consenting', async () => {
      const call = activeCall();
      call.participants[1].recordingConsent = false;
      prisma.callSession.findFirst.mockResolvedValue(call);

      await expect(
        service.createUpload(callId, initiatorId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.callRecording.upsert).not.toHaveBeenCalled();
    });

    it('rejects a call that is not active', async () => {
      prisma.callSession.findFirst.mockResolvedValue({
        ...activeCall(),
        status: CallStatus.ENDED,
      });

      await expect(
        service.createUpload(callId, initiatorId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rotates the object key when retrying a pending upload', async () => {
      const existing = {
        ...pendingUpload(),
        objectKey: 'old-object-key.wav',
      };

      transaction.callRecordingUpload.findUnique.mockResolvedValue(existing);

      await service.createUpload(callId, initiatorId);

      expect(transaction.callRecordingUpload.update).toHaveBeenCalledWith({
        where: { id: uploadId },
        data: {
          objectKey: expect.stringMatching(
            new RegExp(`^call-recordings/${callId}/${recordingId}/`),
          ),
          status: CallRecordingUploadStatus.PENDING,
          expiresAt: expect.any(Date),
        },
      });

      expect(storage.createUploadUrl).toHaveBeenCalledWith(
        expect.not.stringContaining('old-object-key.wav'),
        'audio/wav',
      );
    });

    it('resets an expired upload to PENDING when reissuing its URL', async () => {
      const existing = {
        ...pendingUpload(),
        status: CallRecordingUploadStatus.EXPIRED,
      };

      transaction.callRecordingUpload.findUnique.mockResolvedValue(existing);

      await service.createUpload(callId, initiatorId);

      expect(transaction.callRecordingUpload.update).toHaveBeenCalledWith({
        where: { id: uploadId },
        data: expect.objectContaining({
          status: CallRecordingUploadStatus.PENDING,
          expiresAt: expect.any(Date),
        }),
      });
    });

    it('rejects an already completed upload', async () => {
      transaction.callRecordingUpload.findUnique.mockResolvedValue({
        ...pendingUpload(),
        status: CallRecordingUploadStatus.COMPLETED,
      });

      await expect(
        service.createUpload(callId, initiatorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('refreshUpload', () => {
    it('refreshes the URL for an existing pending upload without rotating its object key', async () => {
      const upload = pendingUpload();
      prisma.callRecordingUpload.findFirst.mockResolvedValue(upload);
      transaction.callRecordingUpload.findUnique.mockResolvedValue({
        id: uploadId,
        status: CallRecordingUploadStatus.PENDING,
      });

      const result = await service.refreshUpload(uploadId, initiatorId);

      expect(result).toMatchObject({
        uploadId,
        uploadUrl: 'https://storage.example/upload',
        expiresIn: 300,
        contentType: 'audio/wav',
      });
      expect(transaction.callRecordingUpload.update).toHaveBeenCalledWith({
        where: { id: uploadId },
        data: { expiresAt: expect.any(Date) },
      });
      expect(storage.createUploadUrl).toHaveBeenCalledWith(
        upload.objectKey,
        'audio/wav',
      );
    });

    it('allows refreshing a pre-end upload after the call has ended', async () => {
      const upload = pendingUpload();
      upload.recording.call.status = CallStatus.ENDED;
      upload.recording.call.endedAt = new Date('2026-11-05T19:00:00Z');
      prisma.callRecordingUpload.findFirst.mockResolvedValue(upload);
      transaction.callRecordingUpload.findUnique.mockResolvedValue({
        id: uploadId,
        status: CallRecordingUploadStatus.PENDING,
      });

      await expect(
        service.refreshUpload(uploadId, initiatorId),
      ).resolves.toMatchObject({ uploadId });

      expect(storage.createUploadUrl).toHaveBeenCalledWith(
        upload.objectKey,
        'audio/wav',
      );
    });

    it('rejects an upload created after the call ended', async () => {
      const upload = pendingUpload();
      upload.recording.call.status = CallStatus.ENDED;
      upload.recording.call.endedAt = new Date('2026-11-05T17:00:00Z');
      prisma.callRecordingUpload.findFirst.mockResolvedValue(upload);

      await expect(
        service.refreshUpload(uploadId, initiatorId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(storage.createUploadUrl).not.toHaveBeenCalled();
    });

    it('rejects refresh when either participant has withdrawn consent', async () => {
      const upload = pendingUpload();
      upload.recording.call.participants[1].recordingConsent = false;
      prisma.callRecordingUpload.findFirst.mockResolvedValue(upload);

      await expect(
        service.refreshUpload(uploadId, initiatorId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(storage.createUploadUrl).not.toHaveBeenCalled();
    });

    it('rejects an upload that is no longer pending', async () => {
      const upload = pendingUpload();
      prisma.callRecordingUpload.findFirst.mockResolvedValue(upload);
      transaction.callRecordingUpload.findUnique.mockResolvedValue({
        id: uploadId,
        status: CallRecordingUploadStatus.COMPLETED,
      });

      await expect(
        service.refreshUpload(uploadId, initiatorId),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(storage.createUploadUrl).not.toHaveBeenCalled();
    });
  });

  describe('completeUpload', () => {
    it('persists a verified WAV track', async () => {
      const result = await service.completeUpload(
        uploadId,
        initiatorId,
        validInput(),
      );

      expect(storage.verifyObject).toHaveBeenCalledWith(
        pendingUpload().objectKey,
      );

      expect(transaction.$queryRaw).toHaveBeenCalledOnce();

      expect(transaction.callRecordingTrack.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          recordingId,
          kind: CallAudioTrackKind.LOCAL_MICROPHONE,
          contentType: 'audio/wav',
          sampleRate: 48_000,
          channels: 1,
          sampleCount: 48_000n,
          durationMs: 1000,
          byteSize: 2048n,
          sha256: 'a'.repeat(64),
        }),
        select: { id: true },
      });

      expect(result).toMatchObject({
        uploadId,
        trackId: '77777777-7777-4777-8777-777777777777',
        status: CallRecordingUploadStatus.COMPLETED,
        recordingStatus: CallRecordingStatus.UPLOADING,
      });

      expect(transaction.callProcessingJob.upsert).not.toHaveBeenCalled();
    });

    it('marks the recording UPLOADED when both tracks exist', async () => {
      transaction.callRecordingTrack.count.mockResolvedValue(2);

      const result = await service.completeUpload(
        uploadId,
        initiatorId,
        validInput(),
      );

      expect(transaction.callRecording.update).toHaveBeenCalledWith({
        where: { id: recordingId },
        data: {
          status: CallRecordingStatus.UPLOADED,
          uploadedAt: expect.any(Date),
        },
      });

      expect(result.recordingStatus).toBe(CallRecordingStatus.UPLOADED);

      expect(transaction.callProcessingJob.upsert).toHaveBeenCalledTimes(1);
      expect(transaction.callProcessingJob.upsert).toHaveBeenCalledWith({
        where: { recordingId },
        create: {
          recordingId,
          status: 'QUEUED',
        },
        update: {},
      });
    });

    it('rejects an upload whose participant belongs to another call', async () => {
      const upload = pendingUpload();
      upload.participant.callId = '88888888-8888-4888-8888-888888888888';
      prisma.callRecordingUpload.findFirst.mockResolvedValue(upload);

      await expect(
        service.completeUpload(uploadId, initiatorId, validInput()),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(storage.verifyObject).not.toHaveBeenCalled();
    });

    it('rejects a user who does not own the upload', async () => {
      prisma.callRecordingUpload.findFirst.mockResolvedValue(null);

      await expect(
        service.completeUpload(uploadId, inviteeId, validInput()),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(storage.verifyObject).not.toHaveBeenCalled();
    });

    it('allows completion after the call has ended', async () => {
      const upload = pendingUpload();
      Object.assign(upload.recording.call, {
        status: CallStatus.ENDED,
        endedAt: new Date('2026-11-05T19:00:00Z'),
      });

      prisma.callRecordingUpload.findFirst.mockResolvedValue(upload);

      await expect(
        service.completeUpload(uploadId, initiatorId, validInput()),
      ).resolves.toMatchObject({
        status: CallRecordingUploadStatus.COMPLETED,
      });
    });

    it('rejects an upload intent created after the call ended', async () => {
      const upload = pendingUpload();
      Object.assign(upload.recording.call, {
        status: CallStatus.ENDED,
        endedAt: new Date('2026-11-05T17:00:00Z'),
      });

      prisma.callRecordingUpload.findFirst.mockResolvedValue(upload);

      await expect(
        service.completeUpload(uploadId, initiatorId, validInput()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects non-WAV metadata', async () => {
      const input = validInput();
      input.contentType = 'audio/pcm';

      await expect(
        service.completeUpload(uploadId, initiatorId, input),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(storage.verifyObject).not.toHaveBeenCalled();
    });

    it('rejects a sample count inconsistent with duration', async () => {
      const input = validInput();
      input.sampleCount = '96000';

      await expect(
        service.completeUpload(uploadId, initiatorId, input),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(storage.verifyObject).not.toHaveBeenCalled();
    });

    it('rejects a storage object with a different size', async () => {
      storage.verifyObject.mockResolvedValue({
        contentLength: 4096,
        contentType: 'audio/wav',
        etag: '"test-etag"',
      });

      await expect(
        service.completeUpload(uploadId, initiatorId, validInput()),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an object with the wrong content type', async () => {
      storage.verifyObject.mockResolvedValue({
        contentLength: 2048,
        contentType: 'application/octet-stream',
        etag: '"test-etag"',
      });

      await expect(
        service.completeUpload(uploadId, initiatorId, validInput()),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns the existing track for an idempotent completion', async () => {
      prisma.callRecordingUpload.findFirst.mockResolvedValue({
        ...pendingUpload(),
        status: CallRecordingUploadStatus.COMPLETED,
      });

      prisma.callRecordingTrack.findUnique.mockResolvedValue({
        id: '77777777-7777-4777-8777-777777777777',
      });

      await expect(
        service.completeUpload(uploadId, initiatorId, validInput()),
      ).resolves.toEqual({
        uploadId,
        trackId: '77777777-7777-4777-8777-777777777777',
        status: CallRecordingUploadStatus.COMPLETED,
      });

      expect(storage.verifyObject).not.toHaveBeenCalled();
    });

    it('rejects a completion claim if another request already claimed it', async () => {
      transaction.callRecordingUpload.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.completeUpload(uploadId, initiatorId, validInput()),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(transaction.callRecordingTrack.create).not.toHaveBeenCalled();
    });
  describe('getRecordingPlayback', () => {
    const readyRecordingCall = () => ({
      ...activeCall(),
      recording: {
        ...recording(),
        status: CallRecordingStatus.READY as CallRecordingStatus,
        tracks: [
          {
            id: '77777777-7777-4777-8777-777777777777',
            kind: CallAudioTrackKind.LOCAL_MICROPHONE,
            objectKey: 'call-recordings/example/microphone.wav',
            contentType: 'audio/wav',
            sampleRate: 48_000,
            channels: 1,
            durationMs: 1000,
          },
          {
            id: '88888888-8888-4888-8888-888888888888',
            kind: CallAudioTrackKind.REMOTE_PARTICIPANT,
            objectKey: 'call-recordings/example/remote.wav',
            contentType: 'audio/wav',
            sampleRate: 48_000,
            channels: 1,
            durationMs: 1000,
          },
        ],
      },
    });

    it('returns signed playback URLs for both authorized tracks', async () => {
      prisma.callSession.findFirst.mockResolvedValue(readyRecordingCall());

      const result = await service.getRecordingPlayback(callId, initiatorId);

      expect(result).toMatchObject({
        callId,
        recordingId,
        status: CallRecordingStatus.READY,
        tracks: [
          {
            kind: CallAudioTrackKind.LOCAL_MICROPHONE,
            downloadUrl: 'https://storage.example/download',
            expiresIn: 300,
          },
          {
            kind: CallAudioTrackKind.REMOTE_PARTICIPANT,
            downloadUrl: 'https://storage.example/download',
            expiresIn: 300,
          },
        ],
      });
      expect(storage.createDownloadUrl).toHaveBeenNthCalledWith(
        1,
        'call-recordings/example/microphone.wav',
      );
      expect(storage.createDownloadUrl).toHaveBeenNthCalledWith(
        2,
        'call-recordings/example/remote.wav',
      );
    });

    it('rejects playback if either participant has withdrawn consent', async () => {
      const call = readyRecordingCall();
      call.participants[1].recordingConsent = false;
      prisma.callSession.findFirst.mockResolvedValue(call);

      await expect(
        service.getRecordingPlayback(callId, initiatorId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.createDownloadUrl).not.toHaveBeenCalled();
    });

    it('rejects playback while the recording is not ready', async () => {
      const call = readyRecordingCall();
      call.recording.status = CallRecordingStatus.UPLOADED;
      prisma.callSession.findFirst.mockResolvedValue(call);

      await expect(
        service.getRecordingPlayback(callId, initiatorId),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(storage.createDownloadUrl).not.toHaveBeenCalled();
    });
  });
  });
});
