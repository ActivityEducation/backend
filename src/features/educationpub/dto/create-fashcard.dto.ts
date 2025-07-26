import { ApiProperty, ApiPropertyOptional, ApiSchema } from "@nestjs/swagger";
import { IsString, IsNotEmpty, IsObject, IsArray, IsOptional, IsUrl, ValidateNested } from 'class-validator'; // Import necessary decorators
import { Type } from 'class-transformer'; // Import Type for nested validation if needed, though not directly used for string[]

@ApiSchema({ name: 'CreateFlashcard' })
export class CreateFlashcardPayload {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'The name or title of the flashcard.' })
  name: string;

  @IsUrl({ host_whitelist: ['localhost'] }) // Ensure this is a valid URL
  @IsNotEmpty()
  @ApiProperty({
    description:
      'The ActivityPub URI of the FlashcardModel this flashcard adheres to.',
  })
  eduModel: string; // URI of the FlashcardModel

  @IsObject() // Validate as an object
  @IsNotEmpty() // Ensure it's not an empty object
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' }, // Assuming string values for simplicity, adjust as needed
    description:
      'Key-value pairs representing the actual data for the flashcard fields defined by its model.',
    example: { Front: 'Hello', Back: 'Bonjour' },
  })
  eduFieldsData: { [key: string]: any }; // Actual data for the fields

  @IsArray()
  @IsString({ each: true }) // Each item in the array must be a string
  @IsOptional()
  @ApiPropertyOptional({
    type: [String],
    description: 'Optional tags associated with the flashcard.',
  })
  eduTags?: string[];

  @IsArray() // Validate that it's an array
  @IsString({ each: true }) // Validate that each item in the array is a string
  @IsUrl({}, { each: true }) // FIX: Apply @IsUrl to each item in the array using { each: true } as a second argument
  @IsOptional()
  @ApiPropertyOptional({
    type: [String],
    description: 'Optional URIs of other related educational objects.',
  })
  eduRelatedTo?: string[];

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({
    description: 'The target language for this flashcard (e.g., "en", "fr").',
  })
  eduTargetLanguage?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({
    description: 'The source language for this flashcard (e.g., "en", "fr").',
  })
  eduSourceLanguage?: string;
}
