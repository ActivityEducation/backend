// src/features/complexity/processors/complexity.processor.ts
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ComplexityService } from '../services/complexity.service';
import { LoggerService } from 'src/shared/services/logger.service';

@Processor('complexity')
export class ComplexityProcessor extends WorkerHost {
  constructor(
    private readonly complexityService: ComplexityService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.logger.setContext('ComplexityProcessor');
  }

  // Gracefully terminate the BullMQ worker when the application receives a shutdown signal.
  // This is triggered by app.enableShutdownHooks() in main.ts and is a key part of
  // building a robust, production-ready system.
  async onModuleDestroy() {
    this.logger.warn('Gracefully shutting down BullMQ Complexity processor...');
    await this.worker.close();
  }

  // The @Process decorator without a name will process all jobs on the queue.
  // We then check the job name internally.
  async process(job: Job<void>): Promise<void> {
    this.logger.log(`Processing job ${job.id} with name ${job.name}...`);

    // Handle the specific named job
    if (job.name === 'calculate-cdc') {
      try {
        this.logger.log(`Starting CDC calculation for job ${job.id}...`);
        await this.complexityService.calculateAndApplyCDC();
        this.logger.log(
          `Successfully completed CDC calculation job ${job.id}.`,
        );
      } catch (error) {
        this.logger.error(`CDC calculation job ${job.id} failed`, error.stack);
        throw error; // Re-throw to let BullMQ handle the failure/retry logic
      }
    } else {
      this.logger.warn(
        `Unknown job name ${job.name} in complexity queue. Skipping.`,
      );
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<void>, error: Error) {
    this.logger.error(
      `Job ${job.id} of type ${job.name} failed: ${error.message}`,
      error.stack,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<void>) {
    this.logger.verbose(`Job ${job.id} of type ${job.name} completed.`);
  }
}
