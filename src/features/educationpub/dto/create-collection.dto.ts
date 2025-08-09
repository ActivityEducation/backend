import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { CollectionVisibility } from '../entities/collection.entity';

export class CreateCollectionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsEnum(CollectionVisibility)
  visibility?: CollectionVisibility;
}