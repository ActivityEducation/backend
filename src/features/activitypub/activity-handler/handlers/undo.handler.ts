// src/features/activitypub/activity-handler/handlers/undo.handler.ts

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

  // Renamed parameter 'activity' to 'jobPayload' for clarity, as it contains more than just the AP activity
  async handleInbox(jobPayload: { localActorId: string, activity: any, activityId: string, actorActivityPubId: string, objectActivityPubId: string }): Promise<void> {
    this.logger.debug(`Received Undo activity (jobPayload): ${JSON.stringify(jobPayload)}`);

    const actorPerformingUndo = jobPayload.actorActivityPubId; // Actor who initiated the Undo
    const mainActivity = jobPayload.activity; // The actual ActivityPub JSON-LD for the Undo activity

    this.logger.log(`Handling 'Undo' activity from '${actorPerformingUndo}'.`);

    // The 'object' of an Undo activity is typically the activity that is being undone.
    // Ensure that 'mainActivity.object' is an object and contains necessary properties.
    if (mainActivity.object && typeof mainActivity.object === 'object') {
      const undoneActivity = mainActivity.object; // This is the original activity (e.g., a Follow or Like)

      const undoObjectType = undoneActivity.type;
      const undoActor = undoneActivity.actor; // The actor of the *undone* activity (e.g., the follower in Undo Follow)
      const undoObjectTarget = undoneActivity.object; // The object of the *undone* activity (e.g., the followed in Undo Follow)

      // Validate that the actor performing the Undo is the same as the actor of the activity being undone.
      // This is a security and logical check as per ActivityPub specifications for Undo.
      if (String(undoActor) !== actorPerformingUndo) {
        this.logger.warn(`Security check failed: Undo actor '${actorPerformingUndo}' does not match actor of undone activity '${undoActor}'. Skipping processing.`);
        throw new BadRequestException('Undo actor and original activity actor are not the same. This is a potential security mismatch.');
      }

      // Ensure extracted IDs are strings for repository lookups
      const undoneActorActivityPubId = String(undoActor);
      const undoneObjectActivityPubId = String(undoObjectTarget);

      switch (undoObjectType) {
        case 'Follow':
          this.logger.log(
            `Processing Undo Follow: '${undoneActorActivityPubId}' unfollowing '${undoneObjectActivityPubId}'.`,
          );
          const resultFollow = await this.followRepository.delete({
            followerActivityPubId: undoneActorActivityPubId,
            followedActivityPubId: undoneObjectActivityPubId,
          });
          if (resultFollow.affected && resultFollow.affected > 0) {
            this.logger.log(
              `Removed Follow relationship: '${undoneActorActivityPubId}' is no longer following '${undoneObjectActivityPubId}'.`,
            );
          } else {
            this.logger.log(
              `Attempted to Undo Follow, but relationship not found: '${undoneActorActivityPubId}' -> '${undoneObjectActivityPubId}'. No action taken.`,
            );
          }
          break;
        case 'Like':
          this.logger.log(
            `Processing Undo Like: '${undoneActorActivityPubId}' unliking '${undoneObjectActivityPubId}'.`,
          );
          const resultLike = await this.likeRepository.delete({
            likerActivityPubId: undoneActorActivityPubId,
            likedObjectActivityPubId: undoneObjectActivityPubId,
          });
          if (resultLike.affected && resultLike.affected > 0) {
            this.logger.log(
              `Removed Like relationship: '${undoneActorActivityPubId}' no longer likes '${undoneObjectActivityPubId}'.`,
            );
          } else {
            this.logger.log(
              `Attempted to Undo Like, but relationship not found: '${undoneActorActivityPubId}' liked '${undoneObjectActivityPubId}'. No action taken.`,
            );
          }
          break;
        case 'Announce':
          this.logger.log(
            `Processing Undo Announce from '${undoneActorActivityPubId}' for object: '${undoneObjectActivityPubId}'.`,
          );
          const resultAnnounce = await this.activityRepository.delete({
            type: 'Announce',
            actorActivityPubId: undoneActorActivityPubId,
            objectActivityPubId: undoneObjectActivityPubId,
          });
          if (resultAnnounce.affected && resultAnnounce.affected > 0) {
            this.logger.log(
              `Removed Announce activity: '${undoneActorActivityPubId}' no longer announces '${undoneObjectActivityPubId}'.`,
            );
          } else {
            this.logger.log(
              `Attempted to Undo Announce, but activity not found: '${undoneActorActivityPubId}' announced '${undoneObjectActivityPubId}'. No action taken.`,
            );
          }
          break;
        case 'Block':
          this.logger.log(
            `Processing Undo Block: '${undoneActorActivityPubId}' unblocking '${undoneObjectActivityPubId}'.`,
          );
          const resultBlock = await this.blockRepository.delete({
            blockerActivityPubId: undoneActorActivityPubId,
            blockedActivityPubId: undoneObjectActivityPubId,
          });
          if (resultBlock.affected && resultBlock.affected > 0) {
            this.logger.log(
              `Removed Block relationship: '${undoneActorActivityPubId}' no longer blocks '${undoneObjectActivityPubId}'.`,
            );
          } else {
            this.logger.log(
              `Attempted to Undo Block, but relationship not found: '${undoneActorActivityPubId}' blocked '${undoneObjectActivityPubId}'. No action taken.`,
            );
          }
          break;
        case 'Create':
          this.logger.log(
            `Processing Undo Create (effectively Delete) for object: '${undoneObjectActivityPubId}'.`,
          );
          if (undoneObjectActivityPubId) {
            const localContentObject =
              await this.contentObjectRepository.findOne({
                where: { activityPubId: undoneObjectActivityPubId },
              });
            if (localContentObject) {
              await this.contentObjectRepository.softDelete(
                localContentObject.id,
              );
              this.logger.log(
                `Soft-deleted local content object (ID: '${undoneObjectActivityPubId}') due to Undo Create activity from '${actorPerformingUndo}'.`,
              );
            } else {
              this.logger.log(
                `Received Undo Create for non-local or non-existent object: '${undoneObjectActivityPubId}'. No local action taken.`,
              );
            }
          } else {
            this.logger.warn(
              `Undo Create activity from '${actorPerformingUndo}' missing target object ID. Skipping processing.`,
            );
          }
          break;
        default:
          this.logger.log(
            `Undo activity from '${actorPerformingUndo}' with unhandled object type: '${undoObjectType}'. Skipping processing.`,
          );
          break;
      }
    } else {
      this.logger.warn(
        `Malformed Undo activity received from '${actorPerformingUndo}': missing object or object type. Skipping processing. Activity object: ${JSON.stringify(mainActivity.object)}`,
      );
    }
    return;
  }

  async handleOutbox(activity: any): Promise<void> {
    console.log('Handling outbox Undo activity:', activity);
  }
}