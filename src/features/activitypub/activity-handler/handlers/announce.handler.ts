import { IActivityHandler } from '../interfaces/activity-handler.interface';
import { ActivityHandler } from '../../../../shared/decorators/activity-handler.decorator';
import { ActivityEntity } from '../../entities/activity.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto'; // Import randomUUID for generating IDs
import { RemoteObjectService } from '../../../../core/services/remote-object.service';
import { LoggerService } from 'src/shared/services/logger.service';

@ActivityHandler('Announce')
export class AnnounceHandler implements IActivityHandler {
  public readonly type = 'Announce';

  constructor(
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: Repository<ActivityEntity>,
    private readonly remoteObjectService: RemoteObjectService,
    private readonly logger: LoggerService, // Injects custom logger
  ) {
    this.logger.setContext('AnnounceHandler');
  }

  async handleInbox(activity: any): Promise<void> {
    const actorActivityPubId = String(activity.actorActivityPubId);
    const objectActivityPubId = typeof activity.objectActivityPubId === 'string' ? String(activity.objectActivityPubId) : undefined;
    
    this.logger.log(
      `Handling 'Announce' activity from '${actorActivityPubId}' for object: '${objectActivityPubId}'.`,
    );
    if (objectActivityPubId) {
      // Generate a unique ID for the Announce activity if not provided, for deduplication.
      const announceActivityId = activity.activityPubId
        ? String(activity.activityPubId)
        : `${actorActivityPubId}/announces/${randomUUID()}`;
      const existingAnnounceActivity = await this.activityRepository.findOne({
        where: { activityPubId: announceActivityId },
      });
      if (!existingAnnounceActivity) {
        // Store the Announce activity
        const newAnnounceActivity = this.activityRepository.create({
          activityPubId: announceActivityId,
          type: 'Announce',
          actorActivityPubId: actorActivityPubId,
          objectActivityPubId: objectActivityPubId,
          data: activity.data,
        });
        await this.activityRepository.save(newAnnounceActivity);
        this.logger.log(
          `Stored Announce activity (ID: '${announceActivityId}') by '${actorActivityPubId}' for object '${objectActivityPubId}'.`,
        );
      } else {
        this.logger.log(
          `Announce activity '${announceActivityId}' already exists. No new action taken.`,
        );
      }

      // Fetch and store the announced object if it's not local. This ensures we have the content locally.
      await this.remoteObjectService.fetchAndStoreRemoteObject(
        objectActivityPubId,
      );
    } else {
      this.logger.warn(
        `Announce activity from '${actorActivityPubId}' missing object ID. Skipping processing.`,
      );
    }
    return;
  }

  async handleOutbox(activity: any): Promise<void> {
    console.log('Handling outbox announce activity:', activity);
  }
}
