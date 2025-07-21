import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityEntity } from '../entities/activity.entity';
import { HandlerDiscoveryService } from '../activity-handler/handler-discovery.service';
import { LoggerService } from 'src/shared/services/logger.service';

@Processor('inbox') // Designates this class as a BullMQ processor for the 'inbox' queue
export class InboxProcessor extends WorkerHost {
  constructor(
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: Repository<ActivityEntity>,
    private readonly logger: LoggerService, // Injects custom logger
    private readonly activityHandlerService: HandlerDiscoveryService,
  ) {
    super();
    this.logger.setContext('InboxProcessor'); // Sets context for the logger
  }

  /**
   * Processes an incoming ActivityPub activity received in an inbox.
   * This method handles various activity types by performing appropriate database operations
   * and potentially enqueuing further actions (e.g., sending an Accept activity).
   * @param job The BullMQ job containing the activity ID to process.
   * @throws Error if processing fails, to ensure BullMQ marks the job as failed and handles retries.
   */
  async process(job: Job<any, any, string>): Promise<any> {
    const { activityId } = job.data;
    this.logger.log(
      `Starting processing for inbox activity job: '${job.id}', Activity DB ID: '${activityId}'.`,
    );

    const activity = await this.activityRepository.findOne({
      where: { id: activityId },
    });
    if (!activity) {
      this.logger.error(
        `Activity with DB ID '${activityId}' not found in database. Skipping processing.`,
      );
      return;
    }

    this.logger.debug(
      `Processing Activity (DB ID: '${activity.id}', AP ID: '${activity.activityPubId}', Type: '${activity.type}', Actor: '${activity.actorActivityPubId}').`,
    );

    const activityType = activity.type;
    const actorActivityPubId = String(activity.actorActivityPubId);

    try {
      const handler = this.activityHandlerService.getHandler(activityType);
      if (handler) {
        try {
          await handler.handleInbox(activity);
        } catch (error) {
          this.logger.error(
            `Error processing inbox activity: ${error.message}`,
            error.stack,
          );
          throw error;
        }
      } else {
        this.logger.log(
          `Unhandled activity type: '${activityType}' from actor '${actorActivityPubId}'. Activity data: ${JSON.stringify(activity.data)}. Skipping processing.`,
        );
      }
      this.logger.log(
        `Successfully completed processing for activity '${activity.activityPubId}'.`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing activity '${activity.activityPubId}' of type '${activityType}' from '${actorActivityPubId}': ${error.message}.`,
        error.stack,
      );
      // Re-throw the error to ensure BullMQ marks the job as failed and handles retries.
      // This is crucial for reliable message processing.
      throw error;
    }
  }

  // BullMQ Worker Event Handlers: Provide visibility into job lifecycle
  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(
      `BullMQ Job '${job.id}' of type '${job.name}' completed successfully.`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `BullMQ Job '${job.id}' of type '${job.name}' failed with error: ${err.message}. Attempts made: ${job.attemptsMade}.`,
      err.stack,
    );
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.debug(
      `BullMQ Job '${job.id}' of type '${job.name}' is now active.`,
    );
  }
}
