import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CallAudioTrackKind,
  CallProcessingJobStatus,
  CallParticipantStatus,
  CallRecordingStatus,
  CallRecordingUploadStatus,
  CallStatus,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CallRecordingStorageService } from './call-recording-storage.service.js';

const AUDIO_CONTENT_TYPE = 'audio/wav';
const UPLOAD_URL_TTL_SECONDS = 300;
const MAX_RECORDING_BYTES = 100 * 1024 * 1024;
const MAX_RECORDING_DURATION_MS = 2 * 60 * 60 * 1000;
const MAX_SAMPLE_RATE = 48_000;

export interface CompleteRecordingUploadInput {
  contentType: string;
  sampleRate: number;
  channels: number;
  sampleCount: string;
  durationMs: number;
  byteSize: number;
  sha256: string;
}

@Injectable()
export class CallRecordingUploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: CallRecordingStorageService,
  ) {}

  async createUpload(callId: string, actorId: string) {
    const actor = actorId.toLowerCase();

    const call = await this.prisma.callSession.findFirst({
      where: {
        id: callId,
        participants: { some: { userId: actor } },
      },
      include: { participants: true },
    });

    if (!call) {
      throw new NotFoundException('Eligible call not found.');
    }

    const accepted = call.participants.filter(
      (participant) => participant.status === CallParticipantStatus.ACCEPTED,
    );
    const actorParticipant = accepted.find(
      (participant) => participant.userId.toLowerCase() === actor,
    );

    if (
      call.status !== CallStatus.ACTIVE ||
      call.participants.length !== 2 ||
      accepted.length !== 2 ||
      !actorParticipant ||
      !accepted.every((participant) => participant.recordingConsent === true)
    ) {
      throw new NotFoundException('Recording upload is not authorized.');
    }

    const kind =
      call.initiatorId.toLowerCase() === actor
        ? CallAudioTrackKind.LOCAL_MICROPHONE
        : CallAudioTrackKind.REMOTE_PARTICIPANT;

    const recording = await this.prisma.callRecording.upsert({
      where: { callId: call.id },
      create: { callId: call.id },
      update: {},
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + UPLOAD_URL_TTL_SECONDS * 1000);

    const upload = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "call_recordings"
        WHERE "id" = ${recording.id}::uuid
        FOR UPDATE
      `;

      const existing = await tx.callRecordingUpload.findUnique({
        where: {
          recordingId_kind: {
            recordingId: recording.id,
            kind,
          },
        },
      });

      if (existing) {
        if (existing.participantId !== actorParticipant.id) {
          throw new NotFoundException('Recording upload is not authorized.');
        }

        if (existing.status === CallRecordingUploadStatus.COMPLETED) {
          throw new ConflictException(
            'This recording track is already uploaded.',
          );
        }

        return tx.callRecordingUpload.update({
          where: { id: existing.id },
          data: {
            objectKey: `call-recordings/${call.id}/${recording.id}/${existing.id}-${randomUUID()}.wav`,
            status: CallRecordingUploadStatus.PENDING,
            expiresAt,
          },
        });
      }

      const uploadId = randomUUID();

      return tx.callRecordingUpload.create({
        data: {
          id: uploadId,
          recordingId: recording.id,
          participantId: actorParticipant.id,
          kind,
          objectKey: `call-recordings/${call.id}/${recording.id}/${uploadId}.wav`,
          expiresAt,
        },
      });
    });

    const signedUpload = await this.storage.createUploadUrl(
      upload.objectKey,
      AUDIO_CONTENT_TYPE,
    );

    return {
      uploadId: upload.id,
      uploadUrl: signedUpload.uploadUrl,
      expiresIn: signedUpload.expiresIn,
      contentType: AUDIO_CONTENT_TYPE,
    };
  }

  async refreshUpload(uploadId: string, actorId: string) {
    const actor = actorId.toLowerCase();

    const upload = await this.prisma.callRecordingUpload.findFirst({
      where: {
        id: uploadId,
        participant: { userId: actor },
      },
      include: {
        participant: true,
        recording: {
          include: {
            call: { include: { participants: true } },
          },
        },
      },
    });

    if (!upload) {
      throw new NotFoundException('Recording upload not found.');
    }

    if (upload.status !== CallRecordingUploadStatus.PENDING) {
      throw new ConflictException(
        'Only pending recording uploads can be refreshed.',
      );
    }

    const call = upload.recording.call;

    if (
      upload.participant.callId !== call.id ||
      call.participants.length !== 2 ||
      !call.participants.every(
        (participant) => participant.recordingConsent === true,
      ) ||
      upload.participant.recordingConsent !== true ||
      (call.status !== CallStatus.ACTIVE && call.status !== CallStatus.ENDED) ||
      (call.endedAt && upload.createdAt > call.endedAt)
    ) {
      throw new NotFoundException('Recording upload is not authorized.');
    }

    const expiresAt = new Date(
      Date.now() + UPLOAD_URL_TTL_SECONDS * 1000,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "call_recordings"
        WHERE "id" = ${upload.recordingId}::uuid
        FOR UPDATE
      `;

      const current = await tx.callRecordingUpload.findUnique({
        where: { id: upload.id },
      });

      if (!current || current.status !== CallRecordingUploadStatus.PENDING) {
        throw new ConflictException(
          'This recording upload is no longer pending.',
        );
      }

      await tx.callRecordingUpload.update({
        where: { id: upload.id },
        data: { expiresAt },
      });
    });

    const signedUpload = await this.storage.createUploadUrl(
      upload.objectKey,
      AUDIO_CONTENT_TYPE,
    );

    return {
      uploadId: upload.id,
      uploadUrl: signedUpload.uploadUrl,
      expiresIn: signedUpload.expiresIn,
      contentType: AUDIO_CONTENT_TYPE,
    };
  }

  async completeUpload(
    uploadId: string,
    actorId: string,
    input: CompleteRecordingUploadInput,
  ) {
    const actor = actorId.toLowerCase();

    const upload = await this.prisma.callRecordingUpload.findFirst({
      where: {
        id: uploadId,
        participant: { userId: actor },
      },
      include: {
        participant: true,
        recording: {
          include: {
            call: { include: { participants: true } },
          },
        },
      },
    });

    if (!upload) {
      throw new NotFoundException('Recording upload not found.');
    }

    if (upload.status === CallRecordingUploadStatus.COMPLETED) {
      const existingTrack = await this.prisma.callRecordingTrack.findUnique({
        where: {
          recordingId_kind: {
            recordingId: upload.recordingId,
            kind: upload.kind,
          },
        },
        select: { id: true },
      });

      if (existingTrack) {
        return {
          uploadId: upload.id,
          trackId: existingTrack.id,
          status: CallRecordingUploadStatus.COMPLETED,
        };
      }
    }

    if (upload.status !== CallRecordingUploadStatus.PENDING) {
      throw new ConflictException(
        'This recording upload is no longer pending.',
      );
    }

    const call = upload.recording.call;
    const participants = call.participants;

    if (
      upload.participant.callId !== call.id ||
      participants.length !== 2 ||
      !participants.every(
        (participant) => participant.recordingConsent === true,
      ) ||
      upload.participant.recordingConsent !== true ||
      (call.status !== CallStatus.ACTIVE && call.status !== CallStatus.ENDED) ||
      (call.endedAt && upload.createdAt > call.endedAt)
    ) {
      throw new NotFoundException('Recording upload is not authorized.');
    }

    this.validateMetadata(input);

    const verified = await this.storage.verifyObject(upload.objectKey);

    if (
      verified.contentLength !== input.byteSize ||
      verified.contentType?.toLowerCase() !== AUDIO_CONTENT_TYPE
    ) {
      throw new BadRequestException(
        'Uploaded audio does not match the declared WAV metadata.',
      );
    }

    const sampleCount = BigInt(input.sampleCount);
    const sha256 = input.sha256.toLowerCase();

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "call_recordings"
        WHERE "id" = ${upload.recordingId}::uuid
        FOR UPDATE
      `;

      const claim = await tx.callRecordingUpload.updateMany({
        where: {
          id: upload.id,
          status: CallRecordingUploadStatus.PENDING,
        },
        data: {
          status: CallRecordingUploadStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      if (claim.count !== 1) {
        throw new ConflictException(
          'This recording upload was already completed.',
        );
      }

      const track = await tx.callRecordingTrack.create({
        data: {
          recordingId: upload.recordingId,
          kind: upload.kind,
          objectKey: upload.objectKey,
          contentType: AUDIO_CONTENT_TYPE,
          sampleRate: input.sampleRate,
          channels: input.channels,
          sampleCount,
          durationMs: input.durationMs,
          byteSize: BigInt(input.byteSize),
          sha256,
        },
        select: { id: true },
      });

      const trackCount = await tx.callRecordingTrack.count({
        where: { recordingId: upload.recordingId },
      });

      const recordingStatus =
        trackCount >= 2
          ? CallRecordingStatus.UPLOADED
          : CallRecordingStatus.UPLOADING;

      await tx.callRecording.update({
        where: { id: upload.recordingId },
        data: {
          status: recordingStatus,
          ...(trackCount >= 2 ? { uploadedAt: new Date() } : {}),
        },
      });

      if (trackCount >= 2) {
        await tx.callProcessingJob.upsert({
          where: { recordingId: upload.recordingId },
          create: {
            recordingId: upload.recordingId,
            status: CallProcessingJobStatus.QUEUED,
          },
          update: {},
        });
      }

      return { trackId: track.id, recordingStatus };
    });

    return {
      uploadId: upload.id,
      trackId: result.trackId,
      status: CallRecordingUploadStatus.COMPLETED,
      recordingStatus: result.recordingStatus,
    };
  }

  async getRecordingPlayback(callId: string, actorId: string) {
    const actor = actorId.toLowerCase();

    const call = await this.prisma.callSession.findFirst({
      where: {
        id: callId,
        participants: { some: { userId: actor } },
      },
      include: {
        participants: true,
        recording: {
          include: {
            tracks: { orderBy: { kind: 'asc' } },
          },
        },
      },
    });

    if (!call) {
      throw new NotFoundException('Call or recording not found.');
    }

    const accepted = call.participants.filter(
      (participant) => participant.status === CallParticipantStatus.ACCEPTED,
    );
    const actorParticipant = accepted.find(
      (participant) => participant.userId.toLowerCase() === actor,
    );

    if (
      call.participants.length !== 2 ||
      accepted.length !== 2 ||
      !actorParticipant ||
      !accepted.every((participant) => participant.recordingConsent === true)
    ) {
      throw new NotFoundException('Recording playback is not authorized.');
    }

    const recording = call.recording;

    if (!recording) {
      throw new NotFoundException('Call or recording not found.');
    }

    if (recording.status !== CallRecordingStatus.READY) {
      throw new ConflictException('Recording is not ready for playback.');
    }

    const tracks = await Promise.all(
      recording.tracks.map(async (track) => {
        const signed = await this.storage.createDownloadUrl(track.objectKey);

        return {
          id: track.id,
          kind: track.kind,
          contentType: track.contentType,
          sampleRate: track.sampleRate,
          channels: track.channels,
          durationMs: track.durationMs,
          downloadUrl: signed.downloadUrl,
          expiresIn: signed.expiresIn,
        };
      }),
    );

    return {
      callId: call.id,
      recordingId: recording.id,
      status: recording.status,
      tracks,
    };
  }

  private validateMetadata(input: CompleteRecordingUploadInput): void {
    if (input.contentType !== AUDIO_CONTENT_TYPE) {
      throw new BadRequestException('Only audio/wav recordings are accepted.');
    }

    if (
      !Number.isSafeInteger(input.byteSize) ||
      input.byteSize < 44 ||
      input.byteSize > MAX_RECORDING_BYTES
    ) {
      throw new BadRequestException('Recording file size is invalid.');
    }

    if (
      !Number.isInteger(input.sampleRate) ||
      input.sampleRate < 8_000 ||
      input.sampleRate > MAX_SAMPLE_RATE
    ) {
      throw new BadRequestException('Recording sample rate is invalid.');
    }

    if (input.channels !== 1) {
      throw new BadRequestException(
        'Recording must contain one audio channel.',
      );
    }

    if (
      !Number.isInteger(input.durationMs) ||
      input.durationMs <= 0 ||
      input.durationMs > MAX_RECORDING_DURATION_MS
    ) {
      throw new BadRequestException('Recording duration is invalid.');
    }

    if (!/^[1-9]\d{0,11}$/.test(input.sampleCount)) {
      throw new BadRequestException('Recording sample count is invalid.');
    }

    const sampleCount = Number(input.sampleCount);
    const expectedDurationMs = Math.round(
      (sampleCount * 1000) / input.sampleRate,
    );

    if (
      !Number.isSafeInteger(sampleCount) ||
      sampleCount > (MAX_SAMPLE_RATE * MAX_RECORDING_DURATION_MS) / 1000 ||
      Math.abs(expectedDurationMs - input.durationMs) > 1
    ) {
      throw new BadRequestException(
        'Recording sample count does not match its duration.',
      );
    }

    if (!/^[a-fA-F0-9]{64}$/.test(input.sha256)) {
      throw new BadRequestException('Recording SHA-256 value is invalid.');
    }
  }
}
