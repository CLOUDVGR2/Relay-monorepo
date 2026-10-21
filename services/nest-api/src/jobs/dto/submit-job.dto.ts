/** Submit job dto module for the Relay NestJS API. */

import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitJobDto {
  @ApiProperty({
    description: 'Job type supported by this endpoint.',
    enum: ['welcome'],
    example: 'welcome',
  })
  @IsIn(['welcome'])
  type!: 'welcome';

  @ApiProperty({
    description: 'Message to include in the welcome job.',
    minLength: 1,
    maxLength: 10000,
    example: 'Welcome to Relay!',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  message!: string;
}
