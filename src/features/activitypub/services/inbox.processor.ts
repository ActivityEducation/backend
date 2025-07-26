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
import { BadRequestException } from '@nestjs/common'; // Import BadRequestException

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
    // Correct destructuring and ensure 'activityPayload' (raw AP payload) is explicitly checked
    const { localActorId, data: activityPayload, activityId, actorActivityPubId, objectActivityPubId, type: activityTypeFromJob } = job.data;
    const jobId = job.id;

    // Robust null/undefined checks for the core activity payload
    // Ensure that activityPayload is an object and has a 'type' property
    if (!activityPayload || typeof activityPayload !== 'object' || typeof activityPayload.type === 'undefined') {
      this.logger.warn(`Job '${jobId}' contains malformed activity payload (data object or its 'type' property is missing). Skipping.`);
      throw new BadRequestException(`Malformed activity payload for job ${jobId}. Missing 'data' object or 'type' property within 'data'.`);
    }

    this.logger.log(`Processing inbox job '${jobId}' for activity type: '${activityPayload.type}'.`);

    // --- Deduplication Check (primary via job.id, but double-check here for robustness) ---
    if (activityId) {
      const existingProcessedActivity = await this.processedActivityRepository.findOne({ where: { activityId: normalizeUrl(activityId) } });
      if (existingProcessedActivity) {
        this.logger.log(`Activity '${jobId}' (ID: ${activityId}) already processed by this worker. Skipping.`);
        return;
      }
    }

    try {
      // Determine the actor who sent this activity
      const senderActorActivityPubId = actorActivityPubId || activityPayload.actor;
      if (!senderActorActivityPubId) {
        this.logger.warn(`Activity '${jobId}' missing 'actor' field. Cannot process without sender. Activity: ${JSON.stringify(activityPayload)}`);
        throw new BadRequestException('Activity has no actor specified.');
      }

      // Store the raw incoming activity payload for audit/debugging
      const newActivityRecord = this.activityRepository.create({
        activityPubId: normalizeUrl(activityPayload.id),
        type: activityPayload.type,
        actorActivityPubId: normalizeUrl(senderActorActivityPubId),
        objectActivityPubId: normalizeUrl(activityPayload.object?.id || activityPayload.object), // Object can be full object or URI
        data: activityPayload, // Store full payload
        // actor: localActor, // Do not link localActor directly here, as this is the sender, not necessarily local.
      });
      await this.activityRepository.save(newActivityRecord);
      this.logger.debug(`Raw incoming activity '${newActivityRecord.activityPubId}' stored.`);

      // Find the appropriate handler for the activity type
      const handler = this.handlerDiscoveryService.getHandler(activityPayload.type);
      if (handler) {
        this.logger.log(`Dispatching activity type '${activityPayload.type}' to handler: ${handler.constructor.name}`);
        // Pass the activity payload along with derived metadata
        await handler.handleInbox({
          localActorId: localActorId, // The local actor who received this (if applicable)
          activity: activityPayload, // Raw ActivityPub payload
          activityId: normalizeUrl(activityId), // Normalized ActivityPub ID of the activity
          actorActivityPubId: normalizeUrl(senderActorActivityPubId), // Normalized ActivityPub ID of the sender
          objectActivityPubId: normalizeUrl(activityPayload.object?.id || activityPayload.object), // Normalized AP ID of the object
          // Add any other parsed/normalized fields needed by handlers
        });
        this.logger.log(`Successfully handled inbox activity '${jobId}' of type '${activityPayload.type}'.`);
      } else {
        this.logger.warn(`No handler found for activity type '${activityPayload.type}' (Job ID: ${jobId}). Activity will be stored but not further processed.`);
      }

      // Mark the activity as processed only after successful handling by the specific handler
      if (activityId) {
        const processed = this.processedActivityRepository.create({ activityId: normalizeUrl(activityId) });
        await this.processedActivityRepository.save(processed);
        this.logger.debug(`Activity '${jobId}' marked as processed.`);
      }

    } catch (error) {
      this.logger.error(`Failed to process inbox activity '${jobId}' (Type: ${activityPayload.type}): ${error.message}`, error.stack);
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