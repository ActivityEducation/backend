import { ApiProperty, ApiPropertyOptional, ApiSchema } from "@nestjs/swagger";

@ApiSchema({ name: 'CreateFlashcard' })
export class CreateFlashcardPayload {
  @ApiProperty({ description: 'The name or title of the flashcard.' })
  name: string;

  @ApiProperty({
    description:
      'The ActivityPub URI of the FlashcardModel this flashcard adheres to.',
  })
  eduModel: string; // URI of the FlashcardModel

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' }, // Assuming string values for simplicity, adjust as needed
    description:
      'Key-value pairs representing the actual data for the flashcard fields defined by its model.',
    example: { Front: 'Hello', Back: 'Bonjour' },
  })
  eduFieldsData: { [key: string]: any }; // Actual data for the fields

  @ApiPropertyOptional({
    type: [String],
    description: 'Optional tags associated with the flashcard.',
  })
  eduTags?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Optional URIs of other related educational objects.',
  })
  eduRelatedTo?: string[];

  @ApiPropertyOptional({
    description: 'The target language for this flashcard (e.g., "en", "fr").',
  })
  eduTargetLanguage?: string;

  @ApiPropertyOptional({
    description: 'The source language for this flashcard (e.g., "en", "fr").',
  })
  eduSourceLanguage?: string;
}