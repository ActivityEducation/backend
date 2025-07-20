import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm'; // For injecting TypeORM repositories
import { Repository } from 'typeorm'; // TypeORM Repository type
import { FlaggedObjectEntity } from './entities/flagged-object.entity'; // Import FlaggedObjectEntity
import { CustomLogger } from '../../core/custom-logger.service';

@Injectable()
export class ModerationService {
  constructor(
    @InjectRepository(FlaggedObjectEntity)
    private readonly flaggedObjectRepository: Repository<FlaggedObjectEntity>, // Repository for FlaggedObjectEntity
    private readonly logger: CustomLogger, // Custom logger
  ) {
    this.logger.setContext('ModerationService'); // Set context for the logger
  }

  /**
   * Records a flagged object for moderation review in the database.
   * This method handles incoming 'Flag' activities from the federated network.
   * @param objectActivityPubId The ActivityPub ID (URI) of the object that was flagged.
   * @param flagerActivityPubId The ActivityPub ID (URI) of the actor who flagged the object.
   * @param category The category of the flag (e.g., 'spam', 'hate_speech', 'nudity', 'unspecified').
   * @param flagActivityData The full ActivityPub 'Flag' activity JSON-LD payload.
   */
  async flagObject(objectActivityPubId: string, flagerActivityPubId: string, category: string, flagActivityData: any) {
    this.logger.log(`ModerationService: Flagging object: '${objectActivityPubId}' by '${flagerActivityPubId}' with category: '${category}'.`);

    // Check if this object has already been flagged by this specific actor to avoid duplicate entries.
    const existingFlag = await this.flaggedObjectRepository.findOne({
      where: {
        objectActivityPubId: objectActivityPubId,
        flagerActivityPubId: flagerActivityPubId,
      },
    });

    if (existingFlag) {
      this.logger.debug(`ModerationService: Object '${objectActivityPubId}' already flagged by '${flagerActivityPubId}'. Updating existing flag record.`);
      // If an existing flag is found, update its details (e.g., the full activity data, category, and update timestamp).
      existingFlag.flagActivityData = flagActivityData;
      existingFlag.category = category; // Update category if provided in the new flag
      existingFlag.updatedAt = new Date(); // Update timestamp
      await this.flaggedObjectRepository.save(existingFlag);
      this.logger.log(`ModerationService: Updated existing flag for object '${objectActivityPubId}'.`);
    } else {
      // If it's a new flag, create a new FlaggedObjectEntity record.
      const newFlaggedObject = this.flaggedObjectRepository.create({
        objectActivityPubId: objectActivityPubId,
        flagerActivityPubId: flagerActivityPubId,
        flagActivityData: flagActivityData,
        status: 'pending_review', // Set initial status for moderation review
        category: category, // Store the flag category
      });
      await this.flaggedObjectRepository.save(newFlaggedObject);
      this.logger.log(`ModerationService: New flag record created for object '${objectActivityPubId}' by '${flagerActivityPubId}'. Status: '${newFlaggedObject.status}', Category: '${newFlaggedObject.category}'.`);
    }

    // Production Grade Improvement:
    // 1. Notify moderators: In a real system, this would trigger an alert to human moderators.
    //    TODO: Integrate with an external notification system (e.g., SendGrid for email, Twilio for SMS, Slack API for chat alerts).
    //    Example placeholder: this.notificationService.sendModerationAlert(newFlaggedObject);
    // 2. Potentially trigger automated content analysis: For large-scale systems, AI/ML models could pre-screen content.
    //    TODO: Integrate with a content analysis service or enqueue a job for AI processing.
    //    Example placeholder: this.contentAnalysisQueue.add('analyzeContent', { objectId: objectActivityPubId });
    this.logger.log(`ModerationService: Object '${objectActivityPubId}' flagged. (Future: Send notification to moderators, trigger automated analysis).`);
  }

  /**
   * Retrieves all flagged objects that are currently pending moderation review.
   * @returns A list of FlaggedObjectEntity instances.
   */
  async getPendingFlaggedObjects(): Promise<FlaggedObjectEntity[]> {
    this.logger.debug('ModerationService: Fetching all pending flagged objects.');
    const pendingFlags = await this.flaggedObjectRepository.find({
      where: { status: 'pending_review' }, // Filter by 'pending_review' status
      order: { createdAt: 'ASC' }, // Order by creation date (oldest first)
    });
    this.logger.log(`ModerationService: Retrieved ${pendingFlags.length} pending flagged objects.`);
    return pendingFlags;
  }

  /**
   * Updates the status of a specific flagged object record.
   * This would typically be called by a moderation dashboard or internal tool.
   * @param id The internal UUID ID of the flagged object record.
   * @param newStatus The new status to set (e.g., 'reviewed', 'dismissed', 'action_taken', 'resolved').
   * @returns The updated FlaggedObjectEntity, or null if the record was not found.
   */
  async updateFlagStatus(id: string, newStatus: string): Promise<FlaggedObjectEntity | null> {
    this.logger.log(`ModerationService: Attempting to update flag status for ID: '${id}' to '${newStatus}'.`);
    const flaggedObject = await this.flaggedObjectRepository.findOne({ where: { id } });
    if (!flaggedObject) {
      this.logger.warn(`ModerationService: Flagged object with ID '${id}' not found for status update.`);
      return null;
    }
    flaggedObject.status = newStatus; // Update the status
    flaggedObject.updatedAt = new Date(); // Update the timestamp
    await this.flaggedObjectRepository.save(flaggedObject); // Save changes to the database
    this.logger.log(`ModerationService: Flagged object '${id}' status successfully updated to: '${newStatus}'.`);
    return flaggedObject;
  }
}