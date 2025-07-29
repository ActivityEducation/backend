import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsOptional,
  IsEnum,
  IsNumber,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class FieldDefinitionDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  id: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  name: string;

  @IsEnum(['text', 'image', 'audio', 'icon'])
  @ApiProperty({ enum: ['text', 'image', 'audio', 'icon'], enumName: 'FieldType' })
  type: 'text' | 'image' | 'audio' | 'icon';
}

class FieldLayoutDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  fieldId: string;

  @IsNumber()
  @ApiProperty()
  x: number;

  @IsNumber()
  @ApiProperty()
  y: number;

  @IsNumber()
  @ApiProperty()
  width: number;

  @IsNumber()
  @ApiProperty()
  height: number;
}

class CardTemplateDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'The unique identifier for the card template.' })
  id: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'The name of the card template.' })
  name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldLayoutDto)
  @ApiProperty({ type: [FieldLayoutDto] })
  layout: FieldLayoutDto[];
}

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
  @Type(() => FieldDefinitionDto)
  @ApiProperty({ type: [FieldDefinitionDto] })
  fields: FieldDefinitionDto[];

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CardTemplateDto)
  @ApiProperty({ type: [CardTemplateDto] })
  cardTemplates: CardTemplateDto[];
}
