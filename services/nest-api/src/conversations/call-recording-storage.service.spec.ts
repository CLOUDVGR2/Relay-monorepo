import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand, GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CallRecordingStorageService } from './call-recording-storage.service.js';

const { sendMock, getSignedUrlMock, clientConfigMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  getSignedUrlMock: vi.fn(),
  clientConfigMock: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();

  return {
    ...actual,
    S3Client: class {
      send = sendMock;

      constructor(config: unknown) {
        clientConfigMock(config);
      }
    },
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

describe('CallRecordingStorageService', () => {
  const config = {
    CALL_RECORDING_STORAGE_BUCKET: 'relay-call-recordings',
    CALL_RECORDING_STORAGE_REGION: 'us-east-1',
    CALL_RECORDING_STORAGE_ACCESS_KEY_ID: 'test-access-key',
    CALL_RECORDING_STORAGE_SECRET_ACCESS_KEY: 'test-secret-key',
    CALL_RECORDING_STORAGE_ENDPOINT: 'http://minio:9000',
    CALL_RECORDING_STORAGE_FORCE_PATH_STYLE: true,
  };

  function createService(
    values: Record<string, string | boolean | undefined> = config,
  ) {
    const configService = {
      get: (key: string) => values[key],
    } as unknown as ConfigService;

    return new CallRecordingStorageService(configService);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a short-lived presigned upload URL', async () => {
    getSignedUrlMock.mockResolvedValue(
      'http://minio:9000/relay-call-recordings/test.wav',
    );

    const result = await createService().createUploadUrl(
      'calls/call-1/track-1.wav',
      'audio/wav',
    );

    expect(result).toEqual({
      uploadUrl: 'http://minio:9000/relay-call-recordings/test.wav',
      expiresIn: 300,
    });

    expect(getSignedUrlMock).toHaveBeenCalledOnce();

    const [client, command, options] = getSignedUrlMock.mock.calls[0];

    expect(client).toBeDefined();
    expect(options).toEqual({ expiresIn: 300 });
    expect(command.input).toEqual({
      Bucket: 'relay-call-recordings',
      Key: 'calls/call-1/track-1.wav',
      ContentType: 'audio/wav',
    });

    expect(clientConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'us-east-1',
        endpoint: 'http://minio:9000',
        forcePathStyle: true,
        credentials: {
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret-key',
        },
      }),
    );
  });

  it('uses the public endpoint only for presigned upload URLs', async () => {
    getSignedUrlMock.mockResolvedValue(
      'https://storage.example.com/relay-call-recordings/test.wav',
    );

    const service = createService({
      ...config,
      CALL_RECORDING_STORAGE_PUBLIC_ENDPOINT: 'https://storage.example.com',
    });

    await service.createUploadUrl('calls/call-1/track-1.wav', 'audio/wav');

    expect(clientConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://storage.example.com',
      }),
    );

    sendMock.mockResolvedValue({
      ContentLength: 1024,
      ContentType: 'audio/wav',
    });

    await service.verifyObject('calls/call-1/track-1.wav');

    expect(clientConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'http://minio:9000',
      }),
    );
  });

  it('creates a short-lived presigned download URL using the public endpoint', async () => {
    getSignedUrlMock.mockResolvedValue(
      'http://10.94.194.50:9000/relay-call-recordings/test.wav',
    );

    const service = createService({
      ...config,
      CALL_RECORDING_STORAGE_PUBLIC_ENDPOINT: 'http://10.94.194.50:9000',
    });

    const result = await service.createDownloadUrl(
      'calls/call-1/track-1.wav',
    );

    expect(result).toEqual({
      downloadUrl: 'http://10.94.194.50:9000/relay-call-recordings/test.wav',
      expiresIn: 300,
    });

    expect(getSignedUrlMock).toHaveBeenCalledOnce();

    const [client, command, options] = getSignedUrlMock.mock.calls[0];

    expect(client).toBeDefined();
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'relay-call-recordings',
      Key: 'calls/call-1/track-1.wav',
    });
    expect(options).toEqual({ expiresIn: 300 });

    expect(clientConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'http://10.94.194.50:9000',
      }),
    );
  });

  it('rejects download URL creation without an explicit public endpoint', async () => {
    await expect(
      createService().createDownloadUrl('calls/call-1/track-1.wav'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it('verifies an uploaded object using HeadObject', async () => {
    sendMock.mockResolvedValue({
      ContentLength: 1024,
      ContentType: 'audio/wav',
      ETag: '"test-etag"',
    });

    const result = await createService().verifyObject(
      'calls/call-1/track-1.wav',
    );

    expect(result).toEqual({
      contentLength: 1024,
      contentType: 'audio/wav',
      etag: '"test-etag"',
    });

    expect(sendMock).toHaveBeenCalledOnce();

    const command = sendMock.mock.calls[0][0];

    expect(command).toBeInstanceOf(HeadObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'relay-call-recordings',
      Key: 'calls/call-1/track-1.wav',
    });
  });

  it('deletes an uploaded object', async () => {
    sendMock.mockResolvedValue({});

    await expect(
      createService().deleteObject('calls/call-1/track-1.wav'),
    ).resolves.toBeUndefined();

    const command = sendMock.mock.calls[0][0];

    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'relay-call-recordings',
      Key: 'calls/call-1/track-1.wav',
    });
  });

  it('rejects upload URL creation when storage is not configured', async () => {
    await expect(
      createService({}).createUploadUrl(
        'calls/call-1/track-1.wav',
        'audio/wav',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects object verification when storage is not configured', async () => {
    await expect(
      createService({}).verifyObject('calls/call-1/track-1.wav'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rejects object deletion when storage is not configured', async () => {
    await expect(
      createService({}).deleteObject('calls/call-1/track-1.wav'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(sendMock).not.toHaveBeenCalled();
  });
});
