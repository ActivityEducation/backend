import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { SpacedRepetitionScheduleEntity } from '../entities/spaced-repetition-schedule.entity';
import { ReviewLogEntity } from '../entities/review-log.entity';
import { FSRSLogic, Rating } from './fsrs.logic';
import { ActorEntity } from 'src/features/activitypub/entities/actor.entity';
import { FlashcardEntity } from '../entities/flashcard.entity';
import { LoggerService } from 'src/shared/services/logger.service';
import { KnowledgeGraphService } from 'src/features/knowledge-graph/services/knowledge-graph.service';

@Injectable()
export class SpacedRepetitionService {
  constructor(
    @InjectRepository(SpacedRepetitionScheduleEntity)
    private scheduleRepository: Repository<SpacedRepetitionScheduleEntity>,
    @InjectRepository(ReviewLogEntity)
    private reviewLogRepository: Repository<ReviewLogEntity>,
    @InjectRepository(ActorEntity)
    private actorRepository: Repository<ActorEntity>,
    @InjectRepository(FlashcardEntity)
    private flashcardRepository: Repository<FlashcardEntity>,
    private fsrsLogic: FSRSLogic,
    private readonly logger: LoggerService,
    private readonly knowledgeGraphService: KnowledgeGraphService,
  ) {
    this.logger.setContext('SpacedRepetitionService');
  }

  /**
   * Processes a user's review of a flashcard, updating its schedule and logging the review.
   * @param actorId The internal ID of the actor performing the review.
   * @param flashcardId The internal ID of the flashcard being reviewed.
   * @param rating The rating given by the user (1-4).
   * @returns The updated SpacedRepetitionScheduleEntity.
   */
  async processReview(actorId: string, flashcardActivityPubId: string, rating: Rating): Promise<SpacedRepetitionScheduleEntity> {
    this.logger.log(`Processing review for actor: ${actorId}, flashcard: ${flashcardActivityPubId}, rating: ${rating}`);
    const reviewTime = new Date();

    const actor = await this.actorRepository.findOneBy({ id: actorId });
    if (!actor) {
      throw new NotFoundException(`Actor with ID ${actorId} not found.`);
    }

    const flashcard = await this.flashcardRepository.findOneBy({ activityPubId: flashcardActivityPubId });
    if (!flashcard) {
      throw new NotFoundException(`Flashcard with ActivityPub ID ${flashcardActivityPubId} not found.`);
    }

    let schedule = await this.scheduleRepository.findOne({
      where: {
        actor: { id: actorId },
        flashcard: { activityPubId: flashcardActivityPubId },
      },
    });

    const logEntry = new ReviewLogEntity();
    logEntry.actor = actor;
    logEntry.flashcard = flashcard;
    logEntry.rating = rating;
    logEntry.reviewed_at = reviewTime;

    if (!schedule) {
      // This is the first review for this actor-flashcard pair.
      this.logger.debug(`No existing schedule found. Creating new schedule.`);
      let cdc_score: number | undefined;
      try {
        // Find the corresponding node in the knowledge graph
        const node = await this.knowledgeGraphService.findNodeByProperties('Flashcard', { flashcardId: flashcard.activityPubId });
        if (node && node.properties.cdc_score) {
            cdc_score = node.properties.cdc_score;
            this.logger.log(`Found cdc_score ${cdc_score} for flashcard ${flashcard.activityPubId}.`);
        }
      } catch (error) {
          this.logger.warn(`Could not retrieve cdc_score for flashcard ${flashcard.activityPubId}. Using default schedule.`);
      }

      const params = actor.fsrs_parameters || undefined;
      const initialState = this.fsrsLogic.calculateInitialState(rating, cdc_score, params);
      
      schedule = this.scheduleRepository.create({
        actor: actor,
        flashcard: flashcard,
        stability: initialState.stability,
        difficulty: initialState.difficulty,
        state: 'Review',
        last_review: reviewTime,
        lapses: 0,
      });

      const interval = this.fsrsLogic['nextInterval'](schedule.stability);
      schedule.due = new Date(reviewTime.getTime() + interval * 24 * 60 * 60 * 1000);
      
      logEntry.previousState = { difficulty: 1, stability: 0, retrievability: 1 };
      logEntry.scheduled_on = reviewTime; // First review is scheduled for "now"
      logEntry.elapsed_time = 0;

    } else {
      // This is a subsequent review.
      this.logger.debug(`Existing schedule found. Updating schedule.`);
      const elapsedDays = (reviewTime.getTime() - new Date(schedule.last_review).getTime()) / (1000 * 60 * 60 * 24);
      logEntry.previousState = {
        difficulty: schedule.difficulty,
        stability: schedule.stability,
        retrievability: this.fsrsLogic['calculateRetrievability'](schedule.stability, elapsedDays)
      };
      logEntry.scheduled_on = schedule.due;
      // Corrected: Round the elapsed time to the nearest whole number to match integer type in database.
      logEntry.elapsed_time = Math.round((reviewTime.getTime() - new Date(schedule.last_review).getTime()) / 1000); // in seconds
      
      schedule = this.fsrsLogic.updateState(schedule, rating, reviewTime);
    }

    logEntry.state = { stability: schedule.stability, difficulty: schedule.difficulty };
    
    await this.reviewLogRepository.save(logEntry);
    this.logger.debug(`Review log saved.`);
    
    const updatedSchedule = await this.scheduleRepository.save(schedule);
    this.logger.log(`Schedule updated. Next due date: ${updatedSchedule.due.toISOString()}`);

    return updatedSchedule;
  }

  /**
   * Retrieves all flashcards that are currently due for review for a given actor.
   * @param actorId The internal ID of the actor.
   * @returns An array of FlashcardEntity objects that are due.
   */
  async getDueFlashcards(actorId: string): Promise<FlashcardEntity[]> {
    this.logger.log(`Fetching due flashcards for actor: ${actorId}`);
    const now = new Date();
    
    const schedules = await this.scheduleRepository.find({
      where: {
        actor: { id: actorId },
        due: LessThanOrEqual(now),
      },
      relations: ['flashcard'], // Ensure flashcard data is loaded
    });

    this.logger.log(`Found ${schedules.length} due flashcards.`);
    return schedules.map(s => s.flashcard);
  }
}
