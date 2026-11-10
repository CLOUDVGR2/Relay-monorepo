import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmittedJobResponseDto {
  @ApiProperty({
    description: 'Identifier assigned to the submitted job.',
    example: 'job_01J8Y4K2M6N7P8Q9R0S1T2U3V4',
  })
  id!: string;

  @ApiProperty({
    description: 'Initial job status.',
    enum: ['queued'],
    example: 'queued',
  })
  status!: 'queued';
}

export class JobStatusResponseDto {
  @ApiProperty({
    description: 'Unique job identifier.',
    example: 'job_01J8Y4K2M6N7P8Q9R0S1T2U3V4',
  })
  id!: string;

  @ApiProperty({
    description: 'Job type.',
    example: 'welcome',
  })
  type!: string;

  @ApiProperty({
    description: 'Current job processing status.',
    example: 'completed',
  })
  status!: string;

  @ApiProperty({
    description: 'Number of processing attempts.',
    example: 1,
  })
  attempt!: number;

  @ApiProperty({
    description: 'Creation timestamp.',
    format: 'date-time',
    example: '2026-11-08T18:30:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'Last update timestamp.',
    format: 'date-time',
    example: '2026-11-08T18:31:00.000Z',
  })
  updatedAt!: string;

  @ApiPropertyOptional({
    description: 'Failure details, when the job has an error.',
    example: 'The downstream service is unavailable.',
  })
  error?: string;
}

export class JobHistoryResponseDto {
  @ApiProperty({
    description: 'Jobs belonging to the authenticated user.',
    type: [JobStatusResponseDto],
  })
  jobs!: JobStatusResponseDto[];
}
