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

  async process(job: Job<void>): Promise<void> {
    this.logger.log(`Processing CDC calculation job ${job.id}...`);
    try {
      await this.complexityService.calculateAndApplyCDC();
      this.logger.log(`Successfully completed CDC calculation job ${job.id}.`);
    } catch (error) {
      this.logger.error(`CDC calculation job ${job.id} failed`, error.stack);
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<void>, error: Error) {
    this.logger.error(`CDC job ${job.id} failed: ${error.message}`, error.stack);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<void>) {
    this.logger.verbose(`CDC job ${job.id} completed.`);
  }
}
