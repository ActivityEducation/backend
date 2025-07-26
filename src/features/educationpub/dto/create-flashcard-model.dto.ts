// src/features/educationpub/dto/create-flashcard-model.dto.ts

import { ApiProperty, ApiPropertyOptional, ApiSchema } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString, IsUrl, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class FlashcardFieldDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Name of the field (e.g., "Front", "Back").' })
  name: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Type of the field (e.g., "text", "html", "image").' })
  type: string;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Whether the field is required.', default: false })
  required?: boolean;
}

export class FlashcardTemplateDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Name of the template (e.g., "Basic").' })
  name: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'HTML template for the front of the card.' })
  frontTemplate: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'HTML template for the back of the card.' })
  backTemplate: string;
}

@ApiSchema({ name: 'CreateFlashcardModel' })
export class CreateFlashcardModelDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'The name of the flashcard model (e.g., "Basic Vocabulary").' })
  name: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ description: 'A short summary or description of the flashcard model.' })
  summary?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => FlashcardFieldDto)
  @ApiProperty({
    type: [FlashcardFieldDto],
    description: 'Defines the structure of fields in this flashcard model.',
    example: [{ name: "Front", type: "text" }, { name: "Back", type: "html" }]
  })
  eduFields: FlashcardFieldDto[];

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => FlashcardTemplateDto)
  @ApiProperty({
    type: [FlashcardTemplateDto],
    description: 'Defines the rendering templates for cards of this model.',
    example: [{ name: "Basic", frontTemplate: "{{Front}}", backTemplate: "{{Back}}" }]
  })
  eduCardTemplates: FlashcardTemplateDto[];

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Optional CSS for styling flashcards of this model.' })
  eduStylingCSS?: string;
}
