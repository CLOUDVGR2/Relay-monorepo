import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CallAudioTrackKind,
  CallRecordingStatus,
  CallRecordingUploadStatus,
} from '../../generated/prisma/enums.js';

export class RecordingUploadUrlResponseDto {
  @ApiProperty({
    description: 'Identifier of the recording upload.',
    format: 'uuid',
    example: '8dd36e71-3c3e-44b8-8469-617c27990d78',
  })
  uploadId!: string;

  @ApiProperty({
    description: 'Temporary signed URL used to upload the WAV recording.',
    format: 'uri',
    example: 'https://storage.example.com/signed-upload',
  })
  uploadUrl!: string;

  @ApiProperty({
    description: 'Number of seconds until the signed upload URL expires.',
    example: 300,
  })
  expiresIn!: number;

  @ApiProperty({
    description: 'Required recording media type.',
    enum: ['audio/wav'],
    example: 'audio/wav',
  })
  contentType!: 'audio/wav';
}

export class CompleteRecordingUploadResponseDto {
  @ApiProperty({
    description: 'Identifier of the completed upload.',
    format: 'uuid',
    example: '8dd36e71-3c3e-44b8-8469-617c27990d78',
  })
  uploadId!: string;

  @ApiProperty({
    description: 'Identifier of the stored recording track.',
    format: 'uuid',
    example: '2b2f5c80-9c76-4a50-9e6c-5e3c7e0a4b12',
  })
  trackId!: string;

  @ApiProperty({
    description: 'Upload completion status.',
    enum: CallRecordingUploadStatus,
    example: CallRecordingUploadStatus.COMPLETED,
  })
  status!: CallRecordingUploadStatus;

  @ApiPropertyOptional({
    description:
      'Recording status after this track was saved. Omitted when returning an already-completed upload.',
    enum: CallRecordingStatus,
    example: CallRecordingStatus.UPLOADING,
  })
  recordingStatus?: CallRecordingStatus;
}

export class RecordingTrackPlaybackResponseDto {
  @ApiProperty({
    description: 'Identifier of the recording track.',
    format: 'uuid',
    example: '2b2f5c80-9c76-4a50-9e6c-5e3c7e0a4b12',
  })
  id!: string;

  @ApiProperty({
    description: 'Participant audio track represented by this recording.',
    enum: CallAudioTrackKind,
    example: CallAudioTrackKind.LOCAL_MICROPHONE,
  })
  kind!: CallAudioTrackKind;

  @ApiProperty({
    description: 'Recording media type.',
    enum: ['audio/wav'],
    example: 'audio/wav',
  })
  contentType!: 'audio/wav';

  @ApiProperty({
    description: 'Audio sample rate in hertz.',
    example: 48000,
  })
  sampleRate!: number;

  @ApiProperty({
    description: 'Number of audio channels.',
    example: 1,
  })
  channels!: number;

  @ApiProperty({
    description: 'Track duration in milliseconds.',
    example: 125000,
  })
  durationMs!: number;

  @ApiProperty({
    description: 'Temporary signed URL used to download the recording.',
    format: 'uri',
    example: 'https://storage.example.com/signed-download',
  })
  downloadUrl!: string;

  @ApiProperty({
    description: 'Number of seconds until the signed download URL expires.',
    example: 300,
  })
  expiresIn!: number;
}

export class RecordingPlaybackResponseDto {
  @ApiProperty({
    description: 'Call identifier.',
    format: 'uuid',
    example: '8dd36e71-3c3e-44b8-8469-617c27990d78',
  })
  callId!: string;

  @ApiProperty({
    description: 'Recording identifier.',
    format: 'uuid',
    example: 'a4f1a6c0-62c2-4a2e-9e6f-4a0e4c1a8d32',
  })
  recordingId!: string;

  @ApiProperty({
    description: 'Recording processing status. Playback is returned when ready.',
    enum: [CallRecordingStatus.READY],
    example: CallRecordingStatus.READY,
  })
  status!: CallRecordingStatus;

  @ApiProperty({
    description: 'Available participant audio tracks.',
    type: [RecordingTrackPlaybackResponseDto],
  })
  tracks!: RecordingTrackPlaybackResponseDto[];
}

export class AuthorizeMediaSessionResponseDto {
  @ApiProperty({
    description: 'Authorized call identifier.',
    format: 'uuid',
    example: '8dd36e71-3c3e-44b8-8469-617c27990d78',
  })
  callId!: string;

  @ApiProperty({
    description: '24-character MongoDB ObjectId of the other accepted call participant.',
    pattern: '^[0-9a-fA-F]{24}$',
    minLength: 24,
    maxLength: 24,
    example: '507f1f77bcf86cd799439011',
  })
  peerId!: string;

  @ApiProperty({
    description: 'Supported call media type.',
    enum: ['AUDIO'],
    example: 'AUDIO',
  })
  type!: 'AUDIO';

  @ApiProperty({
    description: 'Whether both accepted participants consented to recording.',
    example: true,
  })
  recordingAuthorized!: boolean;
}
