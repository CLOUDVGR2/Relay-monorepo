/** Request DTO for tenant-scoped knowledge-base questions. */

import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AnswerQuestionDto {
  @ApiProperty({
    description:
      'Question to answer using the authenticated user knowledge base.',
    minLength: 1,
    maxLength: 2000,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  question!: string;

  @ApiProperty({
    description: 'Maximum number of knowledge-base chunks to retrieve.',
    minimum: 1,
    maximum: 20,
    default: 5,
  })
  @IsInt()
  @Min(1)
  @Max(20)
  top_k: number = 5;
}
