// src/features/fsrs-optimization/services/fsrs-optimization.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FSRS, FSRSReview, FSRSItem } from 'fsrs-rs-nodejs';
import { ActorEntity } from 'src/features/activitypub/entities/actor.entity';
import { ReviewLogEntity } from 'src/features/educationpub/entities/review-log.entity';
import { LoggerService } from 'src/shared/services/logger.service';

@Injectable()
export class FsrsOptimizationService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ActorEntity)
    private actorRepository: Repository<ActorEntity>,
    @InjectRepository(ReviewLogEntity)
    private reviewLogRepository: Repository<ReviewLogEntity>,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('FsrsOptimizationService');
  }

  async optimizeForActor(actorId: string): Promise<void> {
    this.logger.log(`Starting FSRS parameter optimization for actor ID: ${actorId}`);

    const minReviews = this.configService.get<number>('fsrs.minReviewsForOptimization', 200);
    const reviewHistory = await this.reviewLogRepository.find({
      where: { actor: { id: actorId } },
      relations: ['flashcard'],
      order: { reviewed_at: 'ASC' },
    });

    if (reviewHistory.length < minReviews) {
      this.logger.log(`Actor ${actorId} has ${reviewHistory.length} reviews, which is less than the required ${minReviews}. Skipping optimization.`);
      return;
    }

    this.logger.debug(`Found ${reviewHistory.length} reviews for actor ${actorId}. Formatting for optimization.`);

    // 1. Group reviews by flashcard ID.
    const reviewsByCard = new Map<string, FSRSReview[]>();
    for (const log of reviewHistory) {
      if (!reviewsByCard.has(log.flashcard.id)) {
        reviewsByCard.set(log.flashcard.id, []);
      }
      const reviews = reviewsByCard.get(log.flashcard.id)!;
      // Correctly instantiate FSRSReview objects.
      reviews.push(new FSRSReview(
        log.rating,
        Math.round((log.reviewed_at.getTime() - log.scheduled_on.getTime()) / 86400000) // deltaT is in days
      ));
    }
    
    // 2. Format the grouped reviews into FSRSItem[] using the class constructor.
    const trainingSet: FSRSItem[] = Array.from(reviewsByCard.values()).map(reviews => {
        return new FSRSItem(reviews);
    });

    // 3. Instantiate the FSRS optimizer and run the computation.
    const fsrs = new FSRS();
    this.logger.debug(`Running FSRS parameter computation for actor ${actorId}...`);
    
    const weights = await fsrs.computeParameters(trainingSet, false);
    
    // 4. Handle the log-loss value.
    // The fsrs-rs-nodejs library's computeParameters method does not return the loss.
    // We will save 0 as a placeholder. A more advanced implementation could involve
    // a separate calculation or a library update.
    const loss = 0; 

    this.logger.log(`FSRS optimization complete for actor ${actorId}. New loss: ${loss} (placeholder), Weights: ${weights}`);

    // 5. Save the results to the ActorEntity.
    await this.actorRepository.update(actorId, {
      fsrs_parameters: { weights },
      fsrs_log_loss: loss,
    });
    this.logger.log(`Successfully saved new FSRS parameters for actor ID: ${actorId}`);
  }
}
