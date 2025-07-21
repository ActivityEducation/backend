import { Repository } from 'typeorm';
import { IActivityHandler } from '../interfaces/activity-handler.interface';
import { ActivityHandler } from '../../../../shared/decorators/activity-handler.decorator';
import { ActorEntity } from '../../entities/actor.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { ActivityEntity } from '../../entities/activity.entity';
import { ContentObjectEntity } from '../../entities/content-object.entity';
import { BlockEntity } from '../../entities/block.entity';
import { LikeEntity } from '../../entities/like.entity';
import { FollowEntity } from '../../entities/follow.entity';
import { LoggerService } from 'src/shared/services/logger.service';

@ActivityHandler('Move')
export class MoveHandler implements IActivityHandler {
  public readonly type = 'Move';

  constructor(
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: Repository<ActivityEntity>,
    @InjectRepository(ActorEntity)
    private readonly actorRepository: Repository<ActorEntity>,
    @InjectRepository(ContentObjectEntity)
    private readonly contentObjectRepository: Repository<ContentObjectEntity>,
    @InjectRepository(FollowEntity)
    private readonly followRepository: Repository<FollowEntity>,
    @InjectRepository(LikeEntity)
    private readonly likeRepository: Repository<LikeEntity>,
    @InjectRepository(BlockEntity)
    private readonly blockRepository: Repository<BlockEntity>,
    private readonly logger: LoggerService, // Injects custom logger
  ) {
    this.logger.setContext('MoveHandler'); // Sets context for the logger
  }

  async handleInbox(activity: any): Promise<void> {
    const actorActivityPubId = String(activity.actorActivityPubId);
    const objectActivityPubId =
      typeof activity.objectActivityPubId === 'string'
        ? String(activity.objectActivityPubId)
        : undefined;

    this.logger.log(
      `Handling 'Move' activity from '${actorActivityPubId}' for object: '${objectActivityPubId}'.`,
    );
    // Ensure actor, object (old actor ID), and target (new actor ID) properties exist in the activity data.
    // This activity signifies an actor changing their ActivityPub ID (e.g., due to domain migration).
    if (activity.data.actor && activity.data.object && activity.data.target) {
      const oldActorId = String(activity.data.object); // The object of a Move activity is the old actor ID
      const newActorId = String(activity.data.target); // The target is the new actor ID

      // Find the local actor record that needs to be updated
      const localActorToMove = await this.actorRepository.findOne({
        where: { activityPubId: oldActorId },
      });
      if (localActorToMove) {
        this.logger.log(
          `Local actor '${oldActorId}' is moving to '${newActorId}'. Updating local records.`,
        );
        // Update the actor's ActivityPub ID and its 'data' payload
        localActorToMove.activityPubId = newActorId;
        localActorToMove.data = { ...localActorToMove.data, id: newActorId }; // Update ID in JSONB data
        await this.actorRepository.save(localActorToMove);

        // Update all associated records in other tables that reference the old actor ID.
        // This ensures referential integrity and correct linking to the new actor ID.
        await this.activityRepository.update(
          { actorActivityPubId: oldActorId },
          { actorActivityPubId: newActorId },
        );
        await this.contentObjectRepository.update(
          { attributedToActivityPubId: oldActorId },
          { attributedToActivityPubId: newActorId },
        );
        await this.followRepository.update(
          { followerActivityPubId: oldActorId },
          { followerActivityPubId: newActorId },
        );
        await this.followRepository.update(
          { followedActivityPubId: oldActorId },
          { followedActivityPubId: newActorId },
        );
        await this.likeRepository.update(
          { likerActivityPubId: oldActorId },
          { likerActivityPubId: newActorId },
        );
        await this.blockRepository.update(
          { blockerActivityPubId: oldActorId },
          { blockerActivityPubId: newActorId },
        );
        await this.blockRepository.update(
          { blockedActivityPubId: oldActorId },
          { blockedActivityPubId: newActorId },
        );

        this.logger.log(
          `Successfully moved local actor records from '${oldActorId}' to '${newActorId}'.`,
        );
      } else {
        this.logger.log(
          `Received Move activity for remote actor '${oldActorId}' to '${newActorId}'. No local actor to update.`,
        );
      }
    } else {
      this.logger.warn(
        `Malformed Move activity received from '${actorActivityPubId}': missing actor, object, or target. Skipping processing. Activity data: ${JSON.stringify(activity.data)}`,
      );
    }
    return;
  }

  async handleOutbox(activity: any): Promise<void> {
    console.log('Handling outbox Move activity:', activity);
  }
}
