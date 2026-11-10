/** Complete recording upload metadata DTO. */

import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Matches, Max, Min } from 'class-validator';

export class CompleteRecordingUploadDto {
  @ApiProperty({ example: 'audio/wav', enum: ['audio/wav'] })
  @IsIn(['audio/wav'])
  contentType!: string;

  @ApiProperty({ example: 48000, minimum: 8000, maximum: 48000 })
  @IsInt()
  @Min(8000)
  @Max(48000)
  sampleRate!: number;

  @ApiProperty({ example: 1, enum: [1] })
  @IsIn([1])
  channels!: number;

  @ApiProperty({ example: '48000', pattern: '^[1-9]\\d{0,11}$' })
  @IsString()
  @Matches(/^[1-9]\d{0,11}$/)
  sampleCount!: string;

  @ApiProperty({ example: 1000, minimum: 1, maximum: 7200000 })
  @IsInt()
  @Min(1)
  @Max(7200000)
  durationMs!: number;

  @ApiProperty({ example: 96044, minimum: 44, maximum: 104857600 })
  @IsInt()
  @Min(44)
  @Max(104857600)
  byteSize!: number;

  @ApiProperty({
    example: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    pattern: '^[a-fA-F0-9]{64}$',
  })
  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/)
  sha256!: string;
}
