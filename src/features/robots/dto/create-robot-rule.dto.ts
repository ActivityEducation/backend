// src/features/robots/dto/create-robot-rule.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsIn, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateRobotRuleDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The User-agent this rule applies to (e.g., "*", "Googlebot").',
    example: '*',
  })
  userAgent: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['Allow', 'Disallow'])
  @ApiProperty({
    description: 'The type of directive: "Allow" or "Disallow".',
    enum: ['Allow', 'Disallow'],
    example: 'Disallow',
  })
  type: 'Allow' | 'Disallow';

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The path or URL pattern for the directive (e.g., "/", "/admin/").',
    example: '/',
  })
  value: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @ApiProperty({
    description: 'Order of rules for a given User-agent (lower numbers come first). Defaults to 0.',
    example: 0,
    required: false,
  })
  order?: number;
}
