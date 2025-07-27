// src/features/robots/dto/update-robot-rule.dto.ts

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsIn, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateRobotRuleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @ApiPropertyOptional({
    description: 'The User-agent this rule applies to (e.g., "*", "Googlebot").',
    example: 'Googlebot',
  })
  userAgent?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @IsIn(['Allow', 'Disallow'])
  @ApiPropertyOptional({
    description: 'The type of directive: "Allow" or "Disallow".',
    enum: ['Allow', 'Disallow'],
    example: 'Allow',
  })
  type?: 'Allow' | 'Disallow';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @ApiPropertyOptional({
    description: 'The path or URL pattern for the directive (e.g., "/", "/admin/").',
    example: '/private/',
  })
  value?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @ApiPropertyOptional({
    description: 'Order of rules for a given User-agent (lower numbers come first).',
    example: 1,
  })
  order?: number;
}
