// src/features/educationpub/dto/update-flashcard-model.dto.ts

import { PartialType } from '@nestjs/swagger';
import { CreateFlashcardModelDto } from './create-flashcard-model.dto';

// Inherits all properties from CreateFlashcardModelDto and makes them optional
export class UpdateFlashcardModelDto extends PartialType(CreateFlashcardModelDto) {}
