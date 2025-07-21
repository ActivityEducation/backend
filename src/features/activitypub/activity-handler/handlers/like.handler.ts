import { IActivityHandler } from '../interfaces/activity-handler.interface';
import { ActivityHandler } from '../../../../shared/decorators/activity-handler.decorator';
import { LikeEntity } from '../../entities/like.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RemoteObjectService } from '../../../../core/services/remote-object.service';
import { LoggerService } from 'src/shared/services/logger.service';

@ActivityHandler('Like')
export class LikeHandler implements IActivityHandler {
  public readonly type = 'Like';

  constructor(
    @InjectRepository(LikeEntity)
    private readonly likeRepository: Repository<LikeEntity>,
    private readonly remoteObjectService: RemoteObjectService,
    private readonly logger: LoggerService, // Injects custom logger
  ) {
    this.logger.setContext('LikeHandler');
  }

  async handleInbox(activity: any): Promise<void> {
    const actorActivityPubId = String(activity.actorActivityPubId);
    const objectActivityPubId =
      typeof activity.objectActivityPubId === 'string'
        ? String(activity.objectActivityPubId)
        : undefined;

    this.logger.log(
      `Handling 'Like' activity from '${actorActivityPubId}' for object: '${objectActivityPubId}'.`,
    );
    if (objectActivityPubId) {
      // Check if this like relationship already exists
      const existingLike = await this.likeRepository.findOne({
        where: {
          likerActivityPubId: actorActivityPubId,
          likedObjectActivityPubId: objectActivityPubId,
        },
      });

      if (!existingLike) {
        // Store the new Like relationship
        const newLike = this.likeRepository.create({
          likerActivityPubId: actorActivityPubId,
          likedObjectActivityPubId: objectActivityPubId,
        });
        await this.likeRepository.save(newLike);
        this.logger.log(
          `Stored new Like relationship: '${actorActivityPubId}' liked '${objectActivityPubId}'.`,
        );
      } else {
        this.logger.log(
          `Like relationship already exists: '${actorActivityPubId}' liked '${objectActivityPubId}'. No new action taken.`,
        );
      }

      // Fetch and store the liked object if it's not local. This ensures we have the content locally.
      await this.remoteObjectService.fetchAndStoreRemoteObject(
        objectActivityPubId,
      );
    } else {
      this.logger.warn(
        `Like activity from '${actorActivityPubId}' missing object ID. Skipping processing.`,
      );
    }
    return;
  }

  async handleOutbox(activity: any): Promise<void> {
    console.log('Handling outbox like activity:', activity);
  }
}
