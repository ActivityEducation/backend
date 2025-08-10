import { Controller, Post, Get, Body, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { SpacedRepetitionService } from '../services/spaced-repetition.service';
import { SubmitReviewDto } from '../dto/submit-review.dto';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User } from 'src/shared/decorators/user.decorator';
import { FlashcardEntity } from '../entities/flashcard.entity';
import { SpacedRepetitionScheduleEntity } from '../entities/spaced-repetition-schedule.entity';
import { AddCardDto } from '../dto/add-card.dto';

@ApiTags('EducationPub - Spaced Repetition')
@Controller('srs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class SpacedRepetitionController {
  constructor(private readonly srsService: SpacedRepetitionService) {}

  @Post('review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a review for a flashcard' })
  @ApiResponse({ status: 200, description: 'Review processed successfully.', type: SpacedRepetitionScheduleEntity })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Actor or Flashcard not found.' })
  async submitReview(
    @User('actor.id') actorId: string,
    @Body() body: SubmitReviewDto,
  ): Promise<SpacedRepetitionScheduleEntity> {
    return this.srsService.processReview(actorId, body.flashcardActivityPubId, body.rating);
  }

  @Get('due')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all flashcards due for review' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved due flashcards.', type: [FlashcardEntity] })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getDueFlashcards(@User('actor.id') actorId: string): Promise<FlashcardEntity[]> {
    return this.srsService.getDueFlashcards(actorId);
  }

  @Get('schedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Get the user's upcoming review schedule" })
  @ApiResponse({ status: 200, description: 'Successfully retrieved the review schedule.', type: [SpacedRepetitionScheduleEntity] })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getReviewSchedule(@User('actor.id') actorId: string): Promise<SpacedRepetitionScheduleEntity[]> {
    return this.srsService.getReviewSchedule(actorId);
  }

  @Post('add')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a new flashcard to the user\'s study queue' })
  @ApiResponse({ status: 201, description: 'Card added to the new queue successfully.' })
  async addCardToQueue(
    @User('actor.id') actorId: string,
    @Body() body: AddCardDto,
  ): Promise<{ message: string }> {
    await this.srsService.addCardToNewQueue(actorId, body.flashcardActivityPubId);
    return { message: 'Card added to your study queue.' };
  }
}