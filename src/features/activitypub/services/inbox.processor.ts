// src/features/activitypub/services/inbox.processor.ts

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm'; // Import IsNull
import { ActivityEntity } from '../entities/activity.entity';
import { LoggerService } from 'src/shared/services/logger.service';
import { ProcessedActivityEntity } from '../entities/processed-activity.entity';
import { HandlerDiscoveryService } from '../activity-handler/handler-discovery.service';
import { normalizeUrl } from 'src/shared/utils/url-normalizer';
import { BadRequestException } from '@nestjs/common';
import { ActorService } from '../services/actor.service';

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
    private readonly logger: LoggerService,
    private readonly handlerDiscoveryService: HandlerDiscoveryService,
    private readonly actorService: ActorService,
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
    const { localActorId, data: activityPayload, activityId, actorActivityPubId, objectActivityPubId, type: activityTypeFromJob } = job.data;
    const jobId = job.id;

    if (!activityPayload || typeof activityPayload !== 'object' || typeof activityPayload.type === 'undefined') {
      this.logger.warn(`Job '${jobId}' contains malformed activity payload (data object or its 'type' property is missing). Skipping.`);
      throw new BadRequestException(`Malformed activity payload for job ${jobId}. Missing 'data' object or 'type' property within 'data'.`);
    }

    this.logger.log(`Processing inbox job '${jobId}' for activity type: '${activityPayload.type}'.`);

    let recipientActivityPubId: string | null = null; // Initialize as null
    if (localActorId) {
        try {
            const localActor = await this.actorService.findActorById(localActorId);
            if (localActor) {
                recipientActivityPubId = localActor.activityPubId;
                this.logger.debug(`Resolved local actor ID ${localActorId} to ActivityPub ID: ${recipientActivityPubId}`);
            } else {
                this.logger.warn(`Local actor with internal ID ${localActorId} not found for inbox job ${jobId}.`);
            }
        } catch (error) {
            this.logger.error(`Error resolving local actor ID ${localActorId} for activity ${jobId}: ${error.message}`, error.stack);
        }
    }

    // --- Deduplication Check ---
    if (activityId) {
      const existingProcessedActivity = await this.processedActivityRepository.findOne({
        where: {
          activityId: normalizeUrl(activityId),
          // FIX: Use IsNull() when recipientActivityPubId is null, otherwise use the string value
          recipientActivityPubId: recipientActivityPubId === null ? IsNull() : recipientActivityPubId
        }
      });
      if (existingProcessedActivity) {
        this.logger.log(`Activity '${jobId}' (ID: ${activityId}) already processed by this worker for recipient '${recipientActivityPubId || 'N/A'}'. Skipping.`);
        return;
      }
    }

    try {
      const senderActorActivityPubId = actorActivityPubId || activityPayload.actor;
      if (!senderActorActivityPubId) {
        this.logger.warn(`Activity '${jobId}' missing 'actor' field. Cannot process without sender. Activity: ${JSON.stringify(activityPayload)}`);
        throw new BadRequestException('Activity has no actor specified.');
      }

      const newActivityRecord = this.activityRepository.create({
        activityPubId: normalizeUrl(activityPayload.id),
        type: activityPayload.type,
        actorActivityPubId: normalizeUrl(senderActorActivityPubId),
        objectActivityPubId: normalizeUrl(activityPayload.object?.id || activityPayload.object),
        data: activityPayload,
        recipientActivityPubId: recipientActivityPubId,
      });
      await this.activityRepository.save(newActivityRecord);
      this.logger.debug(`Raw incoming activity '${newActivityRecord.activityPubId}' stored.`);

      const handler = this.handlerDiscoveryService.getHandler(activityPayload.type);
      if (handler) {
        this.logger.log(`Dispatching activity type '${activityPayload.type}' to handler: ${handler.constructor.name}`);
        await handler.handleInbox({
          localActorId: localActorId,
          activity: activityPayload,
          activityId: normalizeUrl(activityId),
          actorActivityPubId: normalizeUrl(senderActorActivityPubId),
          objectActivityPubId: normalizeUrl(activityPayload.object?.id || activityPayload.object),
        });
        this.logger.log(`Successfully handled inbox activity '${jobId}' of type '${activityPayload.type}'.`);
      } else {
        this.logger.warn(`No handler found for activity type '${activityPayload.type}' (Job ID: ${jobId}). Activity will be stored but not further processed.`);
      }

      if (activityId) {
        const processed = this.processedActivityRepository.create({
          activityId: normalizeUrl(activityId),
          recipientActivityPubId: recipientActivityPubId // This is now correctly typed as string | null
        });
        await this.processedActivityRepository.save(processed);
        this.logger.debug(`Activity '${jobId}' marked as processed.`);
      }

    } catch (error) {
      this.logger.error(`Failed to process inbox activity '${jobId}' (Type: ${activityPayload.type}): ${error.message}`, error.stack);
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
