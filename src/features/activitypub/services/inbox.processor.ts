// src/features/activitypub/services/inbox.processor.ts

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityEntity } from '../entities/activity.entity';
import { LoggerService } from 'src/shared/services/logger.service';
import { ProcessedActivityEntity } from '../entities/processed-activity.entity';
import { HandlerDiscoveryService } from '../activity-handler/handler-discovery.service';
import { normalizeUrl } from 'src/shared/utils/url-normalizer';

/**
 * InboxProcessor
 *
 * This processor handles jobs from the 'inbox' queue. It is responsible for
 * processing incoming ActivityPub activities received in local actors' inboxes.
 * Key responsibilities include:
 * - Deduplication of activities to prevent reprocessing.
 * - Dispatching activities to the appropriate activity handlers based on their 'type'.
 * - Storing relevant incoming activities and their associated data.
 * - Logging the processing status, including errors.
 *
 * It uses the HandlerDiscoveryService to find and execute the correct handler
 * for each ActivityPub activity type.
 */
@Processor('inbox')
export class InboxProcessor extends WorkerHost {
  constructor(
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: Repository<ActivityEntity>,
    @InjectRepository(ProcessedActivityEntity)
    private readonly processedActivityRepository: Repository<ProcessedActivityEntity>,
    private readonly logger: LoggerService, // Injects custom logger
    private readonly handlerDiscoveryService: HandlerDiscoveryService, // To discover and use activity handlers
  ) {
    super();
    this.logger.setContext('InboxProcessor');
  }

  /**
   * Processes an incoming ActivityPub activity.
   * This method is called by the BullMQ worker for each job in the 'inbox' queue.
   *
   * @param job The job containing the activity data.
   */
  async process(job: Job<any>) {
    const { localActorId, activity, activityId } = job.data;
    const jobId = job.id; // This is the normalized activityId from AppService, used for deduplication

    this.logger.log(`Processing inbox job '${jobId}' for activity type: '${activity.type}'.`);

    if (!activity || !activity.type) {
      this.logger.warn(`Job '${jobId}' contains malformed activity (missing type). Skipping.`);
      return;
    }

    // --- Deduplication Check (primary via job.id, but double-check here for robustness) ---
    // The AppService already performs an initial deduplication check before enqueuing.
    // This check here is a safeguard if the job somehow gets re-added or if the initial check was bypassed.
    if (activityId) {
      const existingProcessedActivity = await this.processedActivityRepository.findOne({ where: { activityId: normalizeUrl(activityId) } });
      if (existingProcessedActivity) {
        this.logger.log(`Activity '${jobId}' (ID: ${activityId}) already processed by this worker. Skipping.`);
        return;
      }
    }

    try {
      // Determine the actor who sent this activity
      const actorActivityPubId = activity.actor;
      if (!actorActivityPubId) {
        this.logger.warn(`Activity '${jobId}' missing 'actor' field. Cannot process without sender. Activity: ${JSON.stringify(activity)}`);
        // We might choose to store this as an 'unattributed' activity or reject it. For now, skip.
        return;
      }

      // Store the raw incoming activity payload for audit/debugging
      const newActivityRecord = this.activityRepository.create({
        activityPubId: normalizeUrl(activity.id),
        type: activity.type,
        actorActivityPubId: normalizeUrl(actorActivityPubId),
        objectActivityPubId: normalizeUrl(activity.object?.id || activity.object), // Object can be full object or URI
        data: activity, // Store full payload
        // actor: localActor, // Do not link localActor directly here, as this is the sender, not necessarily local.
      });
      await this.activityRepository.save(newActivityRecord);
      this.logger.debug(`Raw incoming activity '${newActivityRecord.activityPubId}' stored.`);

      // Find the appropriate handler for the activity type
      const handler = this.handlerDiscoveryService.getHandler(activity.type);
      if (handler) {
        this.logger.log(`Dispatching activity type '${activity.type}' to handler: ${handler.constructor.name}`);
        // Pass the activity payload along with derived metadata
        await handler.handleInbox({
          localActorId: localActorId, // The local actor who received this (if applicable)
          activity: activity, // Raw ActivityPub payload
          activityId: normalizeUrl(activity.id), // Normalized ActivityPub ID of the activity
          actorActivityPubId: normalizeUrl(actorActivityPubId), // Normalized ActivityPub ID of the sender
          objectActivityPubId: normalizeUrl(activity.object?.id || activity.object), // Normalized AP ID of the object
          // Add any other parsed/normalized fields needed by handlers
        });
        this.logger.log(`Successfully handled inbox activity '${jobId}' of type '${activity.type}'.`);
      } else {
        this.logger.warn(`No handler found for activity type '${activity.type}' (Job ID: ${jobId}). Activity will be stored but not further processed.`);
      }

      // Mark the activity as processed only after successful handling by the specific handler
      if (activityId) {
        const processed = this.processedActivityRepository.create({ activityId: normalizeUrl(activityId) });
        await this.processedActivityRepository.save(processed);
        this.logger.debug(`Activity '${jobId}' marked as processed.`);
      }

    } catch (error) {
      this.logger.error(`Failed to process inbox activity '${jobId}' (Type: ${activity.type}): ${error.message}`, error.stack);
      // Re-throw the error so BullMQ can handle retries if configured
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<any>) {
    this.logger.verbose(`Inbox job '${job.id}' completed.`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<any>, error: Error) {
    this.logger.error(`Inbox job '${job.id}' failed: ${error.message}`, error.stack);
  }
}
