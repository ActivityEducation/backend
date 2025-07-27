// src/features/robots/dto/update-sitemap.dto.ts

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsUrl } from 'class-validator';

export class UpdateSitemapDto {
  @IsOptional()
  @IsUrl()
  @IsNotEmpty()
  @ApiPropertyOptional({
    description: 'The full URL of the sitemap (e.g., "https://example.com/sitemap.xml").',
    example: 'https://edupub.social/new-sitemap.xml',
  })
  url?: string;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description: 'Whether this sitemap should be included in robots.txt.',
    example: false,
  })
  isEnabled?: boolean;
}
