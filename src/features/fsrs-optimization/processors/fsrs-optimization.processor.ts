// src/features/fsrs-optimization/processors/fsrs-optimization.processor.ts
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { FsrsOptimizationService } from '../services/fsrs-optimization.service';
import { LoggerService } from 'src/shared/services/logger.service';

interface FsrsOptimizationJobData {
  actorId: string;
}

@Processor('fsrs-optimization')
export class FsrsOptimizationProcessor extends WorkerHost {
  constructor(
    private readonly fsrsOptimizationService: FsrsOptimizationService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.logger.setContext('FsrsOptimizationProcessor');
  }

  async process(job: Job<FsrsOptimizationJobData>): Promise<void> {
    const { actorId } = job.data;
    this.logger.log(`Processing FSRS optimization job ${job.id} for actor ID: ${actorId}`);
    try {
      await this.fsrsOptimizationService.optimizeForActor(actorId);
      this.logger.log(`Successfully completed FSRS optimization for actor ID: ${actorId}`);
    } catch (error) {
      this.logger.error(`FSRS optimization job for actor ${actorId} failed`, error.stack);
      throw error; // Re-throw to let BullMQ handle the failure/retry logic
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<FsrsOptimizationJobData>, error: Error) {
    this.logger.error(`FSRS optimization job ${job.id} for actor '${job.data.actorId}' failed: ${error.message}`, error.stack);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<FsrsOptimizationJobData>) {
    this.logger.verbose(`FSRS optimization job ${job.id} for actor '${job.data.actorId}' completed.`);
  }
}
