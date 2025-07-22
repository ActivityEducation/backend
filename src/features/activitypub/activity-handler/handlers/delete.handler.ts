import { Repository } from 'typeorm';
import { IActivityHandler } from '../interfaces/activity-handler.interface';
import { ActivityHandler } from '../../../../shared/decorators/activity-handler.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { ContentObjectEntity } from '../../entities/content-object.entity';
import { LoggerService } from 'src/shared/services/logger.service';

@ActivityHandler('Delete')
export class DeleteHandler implements IActivityHandler {
  public readonly type = 'Delete';

  constructor(
    @InjectRepository(ContentObjectEntity)
    private readonly contentObjectRepository: Repository<ContentObjectEntity>,
    private readonly logger: LoggerService, // Injects custom logger
  ) {
    this.logger.setContext('DeleteHandler'); // Sets context for the logger
  }

  async handleInbox(activity: any): Promise<void> {
    this.logger.debug(`Received Delete activity: ${JSON.stringify(activity)}`);
    
    const actorActivityPubId = String(activity.actorActivityPubId);
    const objectActivityPubId =
      typeof activity.objectActivityPubId === 'string'
        ? String(activity.objectActivityPubId)
        : undefined;

    this.logger.log(
      `Handling 'Delete' activity from '${actorActivityPubId}' for object: '${objectActivityPubId}'.`,
    );
    if (objectActivityPubId) {
      // If the deleted object is present locally, soft-delete it.
      const localContentObject = await this.contentObjectRepository.findOne({
        where: { activityPubId: objectActivityPubId },
      });
      if (localContentObject) {
        await this.contentObjectRepository.softDelete(localContentObject.id);
        this.logger.log(
          `Soft-deleted local content object (ID: '${objectActivityPubId}') due to Delete activity from '${actorActivityPubId}'.`,
        );
      } else {
        this.logger.log(
          `Received Delete activity for non-local or non-existent object: '${objectActivityPubId}'. No local action taken.`,
        );
      }
      // TODO: Also delete associated activities (e.g., Likes, Announce) related to this object.
    } else {
      this.logger.warn(
        `Delete activity from '${actorActivityPubId}' missing object ID. Skipping processing.`,
      );
    }
    return;
  }

  async handleOutbox(activity: any): Promise<void> {
    console.log('Handling outbox Delete activity:', activity);
  }
}
