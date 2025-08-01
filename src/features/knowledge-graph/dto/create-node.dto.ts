import { IsString, IsObject, IsNotEmpty } from 'class-validator';

export class CreateNodeDto {
  @IsString()
  @IsNotEmpty()
  type: string;

  @IsObject()
  properties: Record<string, any>;
}