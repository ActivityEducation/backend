// src/features/complexity/schedulers/complexity.scheduler.ts
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { LoggerService } from 'src/shared/services/logger.service';

@Injectable()
export class ComplexityScheduler {
  constructor(
    @InjectQueue('complexity') private readonly complexityQueue: Queue,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('ComplexityScheduler');
  }

//   @Cron('0 4 * * 0') // Corrected: Runs at 4:00 AM every Sunday
  @Cron('*/3 * * * *') // TODO: Set this to something else, this is just for testing!
  async handleCron() {
    this.logger.log('Scheduling the periodic Community-Derived Complexity (CDC) calculation job...');
    try {
      await this.complexityQueue.add(
        'calculate-cdc',
        {
          jobId: `cdc-calculation-${new Date().toISOString().split('T')[0]}`, // Daily unique job ID
          removeOnComplete: true,
          attempts: 2,
          backoff: { type: 'exponential', delay: 60000 }, // 1 minute backoff
        },
      );
      this.logger.log('CDC calculation job successfully queued.');
    } catch (error) {
      this.logger.error('Failed to queue CDC calculation job', error.stack);
    }
  }
}
