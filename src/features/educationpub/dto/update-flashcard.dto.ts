// src/features/educationpub/dto/update-flashcard.dto.ts

import { ApiSchema, PartialType } from '@nestjs/swagger';
import { CreateFlashcardPayload } from './create-fashcard.dto';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Inherits all properties from CreateFlashcardPayload and makes them optional.
// Additionally, explicitly adds isPublic and ensures it's optional.
@ApiSchema({ name: 'UpdateFlashcard' })
export class UpdateFlashcardDto extends PartialType(CreateFlashcardPayload) {
  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Whether the flashcard is publicly visible and federated.', default: false })
  isPublic?: boolean;
}
