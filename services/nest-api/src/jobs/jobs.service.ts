/** Service-layer logic for jobs service in the Relay NestJS API. */

import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SubmittedJob {
  id: string;
  status: 'queued';
}

export interface JobStatus {
  id: string;
  type: string;
  status: string;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

@Injectable()
export class JobsService {
  constructor(private readonly configService: ConfigService) {}

  async submitWelcomeJob(
    message: string,
    ownerId: string,
  ): Promise<SubmittedJob> {
    const normalizedMessage = message.trim();

    if (
      !normalizedMessage ||
      Buffer.byteLength(normalizedMessage, 'utf8') > 10000
    ) {
      throw new BadRequestException('The job message is invalid.');
    }

    const payload = await this.requestGoApi('/internal/v1/jobs', {
      method: 'POST',
      body: JSON.stringify({
        type: 'welcome',
        message: normalizedMessage,
        ownerId,
      }),
    });

    const result = this.asObject(payload);

    if (
      typeof result['id'] !== 'string' ||
      !result['id'].trim() ||
      result['status'] !== 'queued'
    ) {
      throw new BadGatewayException(
        'The job service returned an invalid job status.',
      );
    }

    return { id: result['id'], status: 'queued' };
  }

  async getJobHistory(
    ownerId: string,
    limit = 50,
  ): Promise<{ jobs: JobStatus[] }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('Job history limit must be between 1 and 100.');
    }

    const query = new URLSearchParams({
      ownerId,
      limit: String(limit),
    });

    const payload = await this.requestGoApi(
      `/internal/v1/jobs?${query.toString()}`,
    );
    const result = this.asObject(payload);
    const jobs = result['jobs'];

    if (!Array.isArray(jobs)) {
      throw new BadGatewayException(
        'The job service returned invalid history.',
      );
    }

    return {
      jobs: jobs.map((value) => this.validateJobStatus(value)),
    };
  }

  async getJobDetail(ownerId: string, id: string): Promise<JobStatus> {
    if (!id.trim()) {
      throw new NotFoundException('Job not found.');
    }

    const query = new URLSearchParams({ ownerId });
    const encodedId = encodeURIComponent(id);
    const payload = await this.requestGoApi(
      `/internal/v1/jobs/${encodedId}?${query.toString()}`,
      { notFoundAsException: true },
    );

    return this.validateJobStatus(payload);
  }

  private async requestGoApi(
    path: string,
    options: {
      method?: string;
      body?: string;
      notFoundAsException?: boolean;
    } = {},
  ): Promise<unknown> {
    const baseUrl =
      this.configService.getOrThrow<string>('GO_API_BASE_URL');
    const token =
      this.configService.getOrThrow<string>('INTERNAL_API_TOKEN');

    let response: Response;

    try {
      response = await fetch(new URL(path, baseUrl), {
        method: options.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        ...(options.body === undefined ? {} : { body: options.body }),
        signal: AbortSignal.timeout(6000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'The job service is temporarily unavailable. Please try again.',
      );
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new BadGatewayException(
        'The job service returned an invalid response.',
      );
    }

    if (!response.ok) {
      if (options.notFoundAsException && response.status === 404) {
        throw new NotFoundException('Job not found.');
      }

      if (response.status === 503 || response.status === 429) {
        throw new ServiceUnavailableException(
          'The job service is temporarily unavailable.',
        );
      }

      throw new BadGatewayException(
        'The job service could not complete this request.',
      );
    }

    return payload;
  }

  private asObject(value: unknown): Record<string, unknown> {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value)
    ) {
      throw new BadGatewayException(
        'The job service returned an invalid response.',
      );
    }

    return value as Record<string, unknown>;
  }

  private validateJobStatus(value: unknown): JobStatus {
    const result = this.asObject(value);

    if (
      typeof result['id'] !== 'string' ||
      typeof result['type'] !== 'string' ||
      typeof result['status'] !== 'string' ||
      typeof result['attempt'] !== 'number' ||
      typeof result['createdAt'] !== 'string' ||
      typeof result['updatedAt'] !== 'string' ||
      (result['error'] !== undefined &&
        typeof result['error'] !== 'string')
    ) {
      throw new BadGatewayException(
        'The job service returned an invalid job status.',
      );
    }

    return {
      id: result['id'],
      type: result['type'],
      status: result['status'],
      attempt: result['attempt'],
      createdAt: result['createdAt'],
      updatedAt: result['updatedAt'],
      ...(typeof result['error'] === 'string'
        ? { error: result['error'] }
        : {}),
    };
  }
}
