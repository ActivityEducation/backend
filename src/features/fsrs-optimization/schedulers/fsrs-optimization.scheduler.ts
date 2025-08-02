// src/features/fsrs-optimization/schedulers/fsrs-optimization.scheduler.ts
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { ActorEntity } from 'src/features/activitypub/entities/actor.entity';
import { MoreThan, Repository } from 'typeorm';
import { LoggerService } from 'src/shared/services/logger.service';
import { subDays } from 'date-fns';

@Injectable()
export class FsrsOptimizationScheduler {
  constructor(
    @InjectQueue('fsrs-optimization') private readonly optimizationQueue: Queue,
    @InjectRepository(ActorEntity) private readonly actorRepository: Repository<ActorEntity>,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('FsrsOptimizationScheduler');
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron() {
    this.logger.log('Running scheduled FSRS optimization job...');

    // Find actors who have been active recently (e.g., have reviews in the last 7 days)
    // This is a simplified query; a more robust solution might track last_active timestamps.
    const recentActivityCutoff = subDays(new Date(), 7);
    const activeActors = await this.actorRepository.createQueryBuilder('actor')
      .innerJoin('actor.reviewLogs', 'log')
      .where('log.reviewed_at > :date', { date: recentActivityCutoff })
      .select('actor.id')
      .distinct(true)
      .getRawMany();

    if (activeActors.length === 0) {
      this.logger.log('No recently active actors found. No optimizations will be queued.');
      return;
    }

    this.logger.log(`Found ${activeActors.length} recently active actors. Queuing optimization jobs.`);

    for (const actor of activeActors) {
      try {
        await this.optimizationQueue.add(
          'optimize-actor-fsrs',
          { actorId: actor.actor_id },
          {
            jobId: `optimize-${actor.actor_id}`, // Use a consistent job ID to prevent duplicates if the scheduler runs again
            removeOnComplete: true,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          },
        );
        this.logger.debug(`Queued FSRS optimization for actor ID: ${actor.actor_id}`);
      } catch (error) {
        this.logger.error(`Failed to queue FSRS optimization for actor ID: ${actor.actor_id}`, error.stack);
      }
    }
    this.logger.log('Finished queuing FSRS optimization jobs.');
  }
}
