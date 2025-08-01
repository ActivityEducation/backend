import { IsString, IsObject, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateEdgeDto {
  @IsUUID()
  sourceId: string;

  @IsUUID()
  targetId: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsObject()
  properties: Record<string, any>;
}