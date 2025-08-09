import { IsString, IsOptional, IsEnum } from 'class-validator';
import { CollectionVisibility } from '../entities/collection.entity';

export class UpdateCollectionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(CollectionVisibility)
  visibility?: CollectionVisibility;
}