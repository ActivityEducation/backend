import { IActivityHandler } from '../interfaces/activity-handler.interface';
import { ActivityHandler } from '../../../../shared/decorators/activity-handler.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContentObjectEntity } from '../../entities/content-object.entity';
import { RemoteObjectService } from '../../../../core/services/remote-object.service';
import { LoggerService } from 'src/shared/services/logger.service';

@ActivityHandler('Create')
export class CreateHandler implements IActivityHandler {
  public readonly type = 'Create';
  
    constructor(
      @InjectRepository(ContentObjectEntity)
      private readonly contentObjectRepository: Repository<ContentObjectEntity>,
      private readonly remoteObjectService: RemoteObjectService,
      private readonly logger: LoggerService, // Injects custom logger
    ) {
      this.logger.setContext('CreateHandler');
    }

  async handleInbox(activity: any): Promise<void> {
    const actorActivityPubId = String(activity.actorActivityPubId);
    
    this.logger.log(`Handling 'Create' activity from '${actorActivityPubId}'.`);
    // Ensure activity.data.object exists and has an ID. The 'object' is the content being created.
    if (
      activity.data.object &&
      typeof activity.data.object === 'object' &&
      activity.data.object.id
    ) {
      const createdObject = activity.data.object;
      const createdObjectId = String(createdObject.id);

      // Check if this content object already exists to prevent duplicates
      const existingContentObject = await this.contentObjectRepository.findOne({
        where: { activityPubId: createdObjectId },
      });
      if (!existingContentObject) {
        // Create and store the new content object
        const contentObject = this.contentObjectRepository.create({
          activityPubId: createdObjectId,
          type: createdObject.type || 'Note', // Default to 'Note' if type is missing
          attributedToActivityPubId: actorActivityPubId, // The actor who created it
          inReplyToActivityPubId: createdObject.inReplyTo
            ? String(createdObject.inReplyTo)
            : undefined, // If it's a reply
          data: createdObject, // Store the full object payload
        });
        await this.contentObjectRepository.save(contentObject);
        this.logger.log(
          `Stored new content object (Type: '${contentObject.type}', ID: '${contentObject.activityPubId}') from '${actorActivityPubId}'.`,
        );
      } else {
        this.logger.log(
          `Content object '${createdObjectId}' from Create activity already exists. Skipping storage.`,
        );
      }

      // If the created object is a reply to a remote object, try to fetch and store that remote parent object.
      // This helps build local context for conversation threads.
      if (
        createdObject.inReplyTo &&
        typeof createdObject.inReplyTo === 'string'
      ) {
        this.logger.debug(
          `Create activity object is a reply to '${createdObject.inReplyTo}'. Attempting to fetch and store remote parent object.`,
        );
        await this.remoteObjectService.fetchAndStoreRemoteObject(
          String(createdObject.inReplyTo),
        );
      }
    } else {
      this.logger.warn(
        `Received Create activity from '${actorActivityPubId}' with unhandled or malformed object (missing ID or not an object). Skipping storage. Activity object: ${JSON.stringify(activity.data.object)}`,
      );
    }
    return;
  }

  async handleOutbox(activity: any): Promise<void> {
    console.log('Handling outbox create activity:', activity);
  }
}
