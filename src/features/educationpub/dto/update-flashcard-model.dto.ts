// src/features/educationpub/dto/update-flashcard-model.dto.ts

import { ApiSchema, PartialType } from '@nestjs/swagger';
import { CreateFlashcardModelDto } from './create-flashcard-model.dto';

// Inherits all properties from CreateFlashcardModelDto and makes them optional
@ApiSchema({ name: 'UpdateFlashcardModel' })
export class UpdateFlashcardModelDto extends PartialType(CreateFlashcardModelDto) {}
