import { Repository } from 'typeorm';
import { IActivityHandler } from '../interfaces/activity-handler.interface';
import { ActivityHandler } from '../../../../shared/decorators/activity-handler.decorator';
import { ContentObjectEntity } from '../../entities/content-object.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { LoggerService } from 'src/shared/services/logger.service';

@ActivityHandler('Update')
export class UpdateHandler implements IActivityHandler {
  public readonly type = 'Update';

  constructor(
    @InjectRepository(ContentObjectEntity)
    private readonly contentObjectRepository: Repository<ContentObjectEntity>,
    private readonly logger: LoggerService, // Injects custom logger
  ) {
    this.logger.setContext('UpdateHandler'); // Sets context for the logger
  }

  async handleInbox(activity: any): Promise<void> {
    this.logger.debug(`Received Update activity: ${JSON.stringify(activity)}`);
    
    const actorActivityPubId = String(activity.actorActivityPubId);
    const objectActivityPubId =
      typeof activity.objectActivityPubId === 'string'
        ? String(activity.objectActivityPubId)
        : undefined;

    this.logger.log(
      `Handling 'Update' activity from '${actorActivityPubId}' for object: '${objectActivityPubId}'.`,
    );
    // Ensure activity.data.object exists and has an ID. The 'object' is the updated content.
    if (
      activity.data.object &&
      typeof activity.data.object === 'object' &&
      activity.data.object.id
    ) {
      const updatedObjectData = activity.data.object;
      const updatedObjectId = String(updatedObjectData.id);

      // Find the local content object to update
      const localContentObject = await this.contentObjectRepository.findOne({
        where: { activityPubId: updatedObjectId },
      });
      if (localContentObject) {
        // Update the entire 'data' JSONB payload of the content object with the new data.
        // This assumes the incoming 'object' contains the full, updated representation.
        localContentObject.data = updatedObjectData;
        // Also update the type and attributedTo if they changed, though typically they remain constant.
        localContentObject.type =
          updatedObjectData.type || localContentObject.type;
        localContentObject.attributedToActivityPubId =
          updatedObjectData.attributedTo ||
          localContentObject.attributedToActivityPubId;
        await this.contentObjectRepository.save(localContentObject);
        this.logger.log(
          `Updated local content object (ID: '${updatedObjectId}', Type: '${localContentObject.type}') due to Update activity from '${actorActivityPubId}'.`,
        );
      } else {
        this.logger.log(
          `Received Update activity for non-local or non-existent object: '${updatedObjectId}'. Skipping local update.`,
        );
      }
    } else {
      this.logger.warn(
        `Update activity from '${actorActivityPubId}' missing object or object ID. Skipping processing. Activity object: ${JSON.stringify(activity.data.object)}`,
      );
    }
    return;
  }

  async handleOutbox(activity: any): Promise<void> {
    console.log('Handling outbox Update activity:', activity);
  }
}
