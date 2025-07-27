// src/features/robots/dto/create-sitemap.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsUrl } from 'class-validator';

export class CreateSitemapDto {
  @IsUrl()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The full URL of the sitemap (e.g., "https://example.com/sitemap.xml").',
    example: 'https://edupub.social/sitemap.xml',
  })
  url: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Whether this sitemap should be included in robots.txt. Defaults to true.',
    example: true,
    required: false,
  })
  isEnabled?: boolean;
}
