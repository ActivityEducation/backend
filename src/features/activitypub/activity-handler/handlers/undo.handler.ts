import { IActivityHandler } from '../interfaces/activity-handler.interface';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityHandler } from '../../../../shared/decorators/activity-handler.decorator';
import { ActivityEntity } from 'src/features/activitypub/entities/activity.entity';
import { FollowEntity } from 'src/features/activitypub/entities/follow.entity';
import { ContentObjectEntity } from 'src/features/activitypub/entities/content-object.entity';
import { LikeEntity } from 'src/features/activitypub/entities/like.entity';
import { BlockEntity } from 'src/features/activitypub/entities/block.entity';
import { LoggerService } from 'src/shared/services/logger.service';
import { BadRequestException } from '@nestjs/common';

@ActivityHandler('Undo')
export class UndoHandler implements IActivityHandler {
  public readonly type = 'Undo';

  constructor(
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: Repository<ActivityEntity>,
    @InjectRepository(FollowEntity)
    private readonly followRepository: Repository<FollowEntity>,
    @InjectRepository(ContentObjectEntity)
    private readonly contentObjectRepository: Repository<ContentObjectEntity>,
    @InjectRepository(LikeEntity)
    private readonly likeRepository: Repository<LikeEntity>,
    @InjectRepository(BlockEntity)
    private readonly blockRepository: Repository<BlockEntity>,
    private readonly logger: LoggerService, // Injects custom logger
  ) {
    this.logger.setContext('UndoHandler'); // Sets context for the logger
  }

  async handleInbox(activity: any): Promise<void> {
    this.logger.debug(`Received Undo activity: ${JSON.stringify(activity)}`);

    const actorActivityPubId = String(activity.actorActivityPubId);

    this.logger.log(`Handling 'Undo' activity from '${actorActivityPubId}'.`);
    if (activity.data?.['as:object'] && typeof activity.data?.['as:object'] === 'object') {
      const undoObjectType = activity.data?.['as:object']?.type;
      const undoActor = activity.data?.['as:actor']?.id;
      const undoObjectActor = activity.data?.['as:object']?.['as:actor'].id;
      const undoObjectTarget = activity.data?.['as:object']?.['as:object'].id;

      if (undoActor !== undoObjectActor) {
        throw new BadRequestException('Undo actor and object actor are not the same.');
      }

      switch (undoObjectType) {
        case 'Follow':
          this.logger.log(
            `Processing Undo Follow: '${undoObjectActor}' unfollowing '${undoObjectTarget}'.`,
          );
          // When an Undo Follow is received, it means the remote actor is no longer following our local actor.
          // We need to delete the follow relationship where the remote actor is the follower and our local actor is the followed.
          const resultFollow = await this.followRepository.delete({
            followerActivityPubId: undoObjectActor, // The remote actor who is unfollowing
            followedActivityPubId: undoObjectTarget, // Our local actor who was followed
          });
          if (resultFollow.affected && resultFollow.affected > 0) {
            this.logger.log(
              `Removed Follow relationship: '${undoObjectActor}' is no longer following '${undoObjectTarget}'.`,
            );
          } else {
            this.logger.log(
              `Attempted to Undo Follow, but relationship not found: '${undoObjectActor}' -> '${undoObjectTarget}'. No action taken.`,
            );
          }
          break;
        case 'Like':
          this.logger.log(
            `Processing Undo Like: '${undoObjectActor}' unliking '${undoObjectTarget}'.`,
          );
          const resultLike = await this.likeRepository.delete({
            likerActivityPubId: undoObjectActor,
            likedObjectActivityPubId: undoObjectTarget,
          });
          if (resultLike.affected && resultLike.affected > 0) {
            this.logger.log(
              `Removed Like relationship: '${undoObjectActor}' no longer likes '${undoObjectTarget}'.`,
            );
          } else {
            this.logger.log(
              `Attempted to Undo Like, but relationship not found: '${undoObjectActor}' liked '${undoObjectTarget}'. No action taken.`,
            );
          }
          break;
        case 'Announce':
          this.logger.log(
            `Processing Undo Announce from '${undoObjectActor}' for object: '${undoObjectTarget}'.`,
          );
          const resultAnnounce = await this.activityRepository.delete({
            type: 'Announce',
            actorActivityPubId: undoObjectActor,
            objectActivityPubId: undoObjectTarget,
          });
          if (resultAnnounce.affected && resultAnnounce.affected > 0) {
            this.logger.log(
              `Removed Announce activity: '${undoObjectActor}' no longer announces '${undoObjectTarget}'.`,
            );
          } else {
            this.logger.log(
              `Attempted to Undo Announce, but activity not found: '${undoObjectActor}' announced '${undoObjectTarget}'. No action taken.`,
            );
          }
          break;
        case 'Block':
          this.logger.log(
            `Processing Undo Block: '${undoObjectActor}' unblocking '${undoObjectTarget}'.`,
          );
          const resultBlock = await this.blockRepository.delete({
            blockerActivityPubId: undoObjectActor,
            blockedActivityPubId: undoObjectTarget,
          });
          if (resultBlock.affected && resultBlock.affected > 0) {
            this.logger.log(
              `Removed Block relationship: '${undoObjectActor}' no longer blocks '${undoObjectTarget}'.`,
            );
          } else {
            this.logger.log(
              `Attempted to Undo Block, but relationship not found: '${undoObjectActor}' blocked '${undoObjectTarget}'. No action taken.`,
            );
          }
          break;
        case 'Create':
          this.logger.log(
            `Processing Undo Create (effectively Delete) for object: '${undoObjectTarget}'.`,
          );
          if (undoObjectTarget) {
            const localContentObject =
              await this.contentObjectRepository.findOne({
                where: { activityPubId: undoObjectTarget },
              });
            if (localContentObject) {
              await this.contentObjectRepository.softDelete(
                localContentObject.id,
              );
              this.logger.log(
                `Soft-deleted local content object (ID: '${undoObjectTarget}') due to Undo Create activity from '${actorActivityPubId}'.`,
              );
            } else {
              this.logger.log(
                `Received Undo Create for non-local or non-existent object: '${undoObjectTarget}'. No local action taken.`,
              );
            }
          } else {
            this.logger.warn(
              `Undo Create activity from '${actorActivityPubId}' missing target object ID. Skipping processing.`,
            );
          }
          break;
        default:
          this.logger.log(
            `Undo activity from '${actorActivityPubId}' with unhandled object type: '${undoObjectType}'. Skipping processing.`,
          );
          break;
      }
    } else {
      this.logger.warn(
        `Malformed Undo activity received from '${actorActivityPubId}': missing object or object type. Skipping processing. Activity object: ${JSON.stringify(activity.data.object)}`,
      );
    }
    return;
  }

  async handleOutbox(activity: any): Promise<void> {
    console.log('Handling outbox Undo activity:', activity);
  }
}
