import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AddCardDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'The ActivityPub URI of the flashcard to add.' })
  flashcardActivityPubId: string;
}