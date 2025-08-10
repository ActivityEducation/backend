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

    // --- REVISED QUERY: Use QueryBuilder for a more explicit lookup ---
    let schedule = await this.scheduleRepository.createQueryBuilder("schedule")
        .where("schedule.actorId = :actorId", { actorId: actor.id })
        .andWhere("schedule.flashcardId = :flashcardId", { flashcardId: flashcard.id })
        .getOne();

    const logEntry = new ReviewLogEntity();
    logEntry.actor = actor;
    logEntry.flashcard = flashcard;
    logEntry.rating = rating;
    logEntry.reviewed_at = reviewTime;

    // This logic now correctly handles a first review OR a review of a 'New' card
    if (!schedule || schedule.state === 'New') {
      this.logger.debug(`No existing schedule found or card is 'New'. Creating initial schedule.`);
      
      const params = actor.fsrs_parameters || undefined;
      const initialState = this.fsrsLogic.calculateInitialState(rating, undefined, params);
      
      // If schedule doesn't exist at all, create it.
      if (!schedule) {
          schedule = this.scheduleRepository.create({
              actor: actor,
              flashcard: flashcard,
          });
      }

      // Update schedule with initial FSRS state
      schedule.stability = initialState.stability;
      schedule.difficulty = initialState.difficulty;
      schedule.state = 'Review'; // Update state from 'New' to 'Review'
      schedule.last_review = reviewTime;
      schedule.lapses = 0;

      const interval = this.fsrsLogic['nextInterval'](schedule.stability);
      schedule.due = new Date(reviewTime.getTime() + interval * 24 * 60 * 60 * 1000);
      
      logEntry.previousState = { difficulty: 1, stability: 0, retrievability: 1 };
      logEntry.scheduled_on = reviewTime;
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
      logEntry.elapsed_time = Math.round((reviewTime.getTime() - new Date(schedule.last_review).getTime()) / 1000);
      
      // The updateState function will modify the schedule object by reference
      this.fsrsLogic.updateState(schedule, rating, reviewTime);
    }

    logEntry.state = { stability: schedule.stability, difficulty: schedule.difficulty };
    
    // Save the log first
    await this.reviewLogRepository.save(logEntry);
    this.logger.debug(`Review log saved.`);
    
    // Now save the schedule (which will be an INSERT or an UPDATE)
    const updatedSchedule = await this.scheduleRepository.save(schedule);
    this.logger.log(`Schedule updated. Next due date: ${updatedSchedule.due.toISOString()}`);

    return updatedSchedule;
  }

  async addCardToNewQueue(
    actorId: string,
    flashcardActivityPubId: string,
  ): Promise<void> {
    this.logger.log(
      `Adding card ${flashcardActivityPubId} to new queue for actor ${actorId}`,
    );

    const actor = await this.actorRepository.findOneBy({ id: actorId });
    if (!actor)
      throw new NotFoundException(`Actor with ID ${actorId} not found.`);

    const flashcard = await this.flashcardRepository.findOneBy({
      activityPubId: flashcardActivityPubId,
    });
    if (!flashcard)
      throw new NotFoundException(
        `Flashcard with ActivityPub ID ${flashcardActivityPubId} not found.`,
      );

    // Check if a schedule already exists
    const existingSchedule = await this.scheduleRepository.findOne({
      where: {
        actor: { id: actorId },
        flashcard: { activityPubId: flashcardActivityPubId },
      },
    });

    if (existingSchedule) {
      this.logger.log(
        `Card ${flashcardActivityPubId} already has a schedule for this actor. No action taken.`,
      );
      return; // Or throw a ConflictException
    }

    // Create a schedule entry with state 'New' and due for now.
    // No log is created, and stability/difficulty remain at their defaults.
    const newSchedule = this.scheduleRepository.create({
      actor: actor,
      flashcard: flashcard,
      due: new Date(), // Set due for now so it appears in the next study session
      state: 'New',
      stability: 0,
      difficulty: 0,
      lapses: 0,
      last_review: undefined,
    });

    await this.scheduleRepository.save(newSchedule);
    this.logger.log(
      `Card ${flashcardActivityPubId} successfully scheduled as 'New'.`,
    );
  }

  /**
   * Retrieves all flashcards that are currently due for review for a given actor.
   * @param actorId The internal ID of the actor.
   * @returns An array of objects matching the DueFlashcard interface expected by the frontend.
   */
  async getDueFlashcards(actorId: string): Promise<any[]> { // Return `any[]` to match the new structure
    this.logger.log(`Fetching due flashcards for actor: ${actorId}`);
    const now = new Date();
    
    const schedules = await this.scheduleRepository.find({
      where: {
        actor: { id: actorId },
        due: LessThanOrEqual(now),
      },
      // MODIFICATION: Eagerly load the flashcard AND the flashcard's model
      relations: ['flashcard', 'flashcard.eduModel'], 
    });

    this.logger.log(`Found ${schedules.length} due flashcards.`);
    
    // MODIFICATION: Map the result to the structure the frontend expects
    return schedules.map(s => ({
        data: s.flashcard,          // The 'data' property holds the FlashcardEntity
        model: s.flashcard.eduModel // The 'model' property holds the related FlashcardModelEntity
    }));
  }

  async getReviewSchedule(actorId: string): Promise<SpacedRepetitionScheduleEntity[]> {
    this.logger.log(`Fetching review schedule for actor: ${actorId}`);
    return this.scheduleRepository.find({
      where: {
        actor: { id: actorId },
      },
      order: {
        due: 'ASC',
      },
      relations: ['flashcard', 'flashcard.eduModel'],
    });
  }
}
