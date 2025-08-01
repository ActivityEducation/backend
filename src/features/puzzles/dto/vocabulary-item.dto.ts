import { IsArray, IsString, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class VocabularyItemDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  word: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  definition: string;
}