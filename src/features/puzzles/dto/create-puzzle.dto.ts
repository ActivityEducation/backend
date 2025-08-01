import { Type } from "class-transformer";
import { IsArray, ValidateNested } from "class-validator";
import { VocabularyItemDto } from "./vocabulary-item.dto";
import { ApiProperty } from "@nestjs/swagger";

export class CreatePuzzleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VocabularyItemDto)
  @ApiProperty({ type: [VocabularyItemDto] })
  vocabulary: VocabularyItemDto[];
}