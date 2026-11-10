import { File, UploadType } from 'expo-file-system';
import { API_ORIGIN, api } from './api';
import type { NativeRecordingResult } from './call-audio-recorder';

export type RecordingUploadIntent = {
  uploadId: string;
  uploadUrl: string;
  expiresIn: number;
  contentType: 'audio/wav';
};

export type CompleteRecordingUploadInput = {
  contentType: 'audio/wav';
  sampleRate: number;
  channels: 1;
  sampleCount: string;
  durationMs: number;
  byteSize: number;
  sha256: string;
};

export type CompleteRecordingUploadResult = {
  uploadId: string;
  trackId: string;
  status: 'COMPLETED';
  recordingStatus?: 'UPLOADING' | 'UPLOADED';
};

export async function createRecordingUpload(
  callId: string,
): Promise<RecordingUploadIntent> {
  const response = await api.post<RecordingUploadIntent>(
    `${API_ORIGIN}/calls/${encodeURIComponent(callId)}/recording-upload`,
  );

  return response.data;
}

export async function refreshRecordingUpload(
  uploadId: string,
): Promise<RecordingUploadIntent> {
  const response = await api.post<RecordingUploadIntent>(
    `${API_ORIGIN}/calls/recording-uploads/${encodeURIComponent(uploadId)}/refresh`,
  );

  return response.data;
}

export async function completeRecordingUpload(
  uploadId: string,
  metadata: CompleteRecordingUploadInput,
): Promise<CompleteRecordingUploadResult> {
  const response = await api.post<CompleteRecordingUploadResult>(
    `${API_ORIGIN}/calls/recording-uploads/${encodeURIComponent(uploadId)}/complete`,
    metadata,
  );

  return response.data;
}


/**
 * Uploads a completed WAV file directly to private object storage.
 *
 * This deliberately does not use the authenticated API client: the
 * presigned URL is the authorization, and the user's bearer token must
 * never be sent to object storage.
 */
export async function uploadRecordingFile(
  uploadUrl: string,
  filePath: string,
): Promise<void> {
  const fileUri = filePath.startsWith('file://')
    ? filePath
    : filePath.startsWith('/')
      ? `file://${filePath}`
      : null;

  if (!fileUri) {
    throw new Error('Recording path must be an absolute filesystem path.');
  }

  const result = await new File(fileUri).upload(uploadUrl, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': 'audio/wav',
    },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(
      `Recording upload failed with HTTP ${result.status}.`,
    );
  }
}


/**
 * Creates an upload intent, uploads the WAV directly to object storage,
 * and confirms its metadata with the authenticated Nest API.
 */
export async function uploadCompletedCallRecording(
  callId: string,
  recording: NativeRecordingResult,
): Promise<CompleteRecordingUploadResult> {
  const intent = await createRecordingUpload(callId);

  await uploadRecordingFile(intent.uploadUrl, recording.path);

  return completeRecordingUpload(intent.uploadId, {
    contentType: 'audio/wav',
    sampleRate: recording.sampleRate,
    channels: recording.channels,
    sampleCount: recording.sampleCount,
    durationMs: recording.durationMs,
    byteSize: recording.byteSize,
    sha256: recording.sha256,
  });
}
