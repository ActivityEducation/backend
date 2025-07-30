import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsNumber, IsUUID } from 'class-validator';
import { Rating } from '../services/fsrs.logic';

export class SubmitReviewDto {
  @IsUUID()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The ActivityPub URI of the flashcard being reviewed.',
    example: 'https://edupub.social/api/objects/68a804b9-cc4a-46c7-b7e4-c086b4ca41ff',
  })
  flashcardActivityPubId: string;

  @IsNumber()
  @IsIn([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy])
  @ApiProperty({
    description: 'The rating for the review (1: Again, 2: Hard, 3: Good, 4: Easy).',
    enum: Rating,
    enumName: 'Rating',
    example: 3,
  })
  rating: Rating;
}