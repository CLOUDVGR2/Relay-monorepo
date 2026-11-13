import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const UPLOAD_URL_EXPIRES_SECONDS = 300;

export interface VerifiedRecordingObject {
  contentLength: number | undefined;
  contentType: string | undefined;
  etag: string | undefined;
}

@Injectable()
export class CallRecordingStorageService {
  private internalClient: S3Client | undefined;
  private publicClient: S3Client | undefined;

  constructor(private readonly config: ConfigService) {}

  async createUploadUrl(
    objectKey: string,
    contentType: string,
  ): Promise<{ uploadUrl: string; expiresIn: number }> {
    const { client, bucket } = this.getStorage('public');

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: UPLOAD_URL_EXPIRES_SECONDS,
    });

    return {
      uploadUrl,
      expiresIn: UPLOAD_URL_EXPIRES_SECONDS,
    };
  }

  async createDownloadUrl(
    objectKey: string,
  ): Promise<{ downloadUrl: string; expiresIn: number }> {
    const { client, bucket } = this.getStorage('public');

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    });

    const downloadUrl = await getSignedUrl(client, command, {
      expiresIn: UPLOAD_URL_EXPIRES_SECONDS,
    });

    return {
      downloadUrl,
      expiresIn: UPLOAD_URL_EXPIRES_SECONDS,
    };
  }

  async verifyObject(objectKey: string): Promise<VerifiedRecordingObject> {
    const { client, bucket } = this.getStorage('internal');

    const result = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
    );

    return {
      contentLength: result.ContentLength,
      contentType: result.ContentType,
      etag: result.ETag,
    };
  }

  async deleteObject(objectKey: string): Promise<void> {
    const { client, bucket } = this.getStorage('internal');

    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
    );
  }

  private getStorage(endpointType: 'internal' | 'public'): {
    client: S3Client;
    bucket: string;
  } {
    const bucket = this.config.get<string>('CALL_RECORDING_STORAGE_BUCKET');
    const region = this.config.get<string>('CALL_RECORDING_STORAGE_REGION');
    const accessKeyId = this.config.get<string>(
      'CALL_RECORDING_STORAGE_ACCESS_KEY_ID',
    );
    const secretAccessKey = this.config.get<string>(
      'CALL_RECORDING_STORAGE_SECRET_ACCESS_KEY',
    );

    if (
      !bucket ||
      !region ||
      Boolean(accessKeyId) !== Boolean(secretAccessKey)
    ) {
      throw new ServiceUnavailableException(
        'Call recording storage is not configured.',
      );
    }

    const internalEndpoint = this.config.get<string>(
      'CALL_RECORDING_STORAGE_ENDPOINT',
    );
    const publicEndpoint =
      this.config.get<string>('CALL_RECORDING_STORAGE_PUBLIC_ENDPOINT') ??
      internalEndpoint;

    const endpoint =
      endpointType === 'public' ? publicEndpoint : internalEndpoint;

    const existingClient =
      endpointType === 'public' ? this.publicClient : this.internalClient;

    if (!existingClient) {
      const client = new S3Client({
        region,
        endpoint,
        forcePathStyle:
          this.config.get<boolean>('CALL_RECORDING_STORAGE_FORCE_PATH_STYLE') ??
          false,
        ...(accessKeyId && secretAccessKey
          ? { credentials: { accessKeyId, secretAccessKey } }
          : {}),
      });

      if (endpointType === 'public') {
        this.publicClient = client;
      } else {
        this.internalClient = client;
      }
    }

    return {
      client:
        endpointType === 'public' ? this.publicClient! : this.internalClient!,
      bucket,
    };
  }
}
