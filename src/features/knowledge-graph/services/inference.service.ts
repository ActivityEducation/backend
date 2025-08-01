import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class InferenceService {
  private readonly logger = new Logger(InferenceService.name);

  constructor(
    @InjectQueue('inference') private readonly inferenceQueue: Queue,
  ) {}

  public async queueInferenceTask(flashcardId: string): Promise<void> {
    try {
      // REMOVE the job name. The payload becomes the first argument.
      await this.inferenceQueue.add(
        'process-flashcard', // Job payload
        {
          flashcardId,
          jobId: `inference-${flashcardId}`,
          removeOnComplete: true,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );
      this.logger.log(
        `Successfully queued inference task for flashcard ID: ${flashcardId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to queue inference task for flashcard ID: ${flashcardId}`,
        error.stack,
      );
      throw new Error(`Failed to queue inference task: ${error.message}`);
    }
  }
}
