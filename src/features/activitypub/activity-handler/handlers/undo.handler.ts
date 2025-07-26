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
import { normalizeUrl } from 'src/shared/utils/url-normalizer';

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

    // FIX: Robustly extract the 'undoneActivity' from either 'object' or 'as:object'
    const undoneActivity = mainActivity.object || mainActivity['as:object'];

    if (undoneActivity && typeof undoneActivity === 'object') {
      // FIX: Extract actor and object from the 'undoneActivity' (nested object), checking both forms
      const undoObjectType = undoneActivity.type;

      // Robustly extract the actor's ActivityPub ID from the undone activity
      let undoActorRaw = undoneActivity.actor || undoneActivity['as:actor'];
      let undoActorActivityPubId: string; // Declared here
      if (typeof undoActorRaw === 'string') {
          undoActorActivityPubId = normalizeUrl(undoActorRaw);
      } else if (typeof undoActorRaw === 'object' && undoActorRaw !== null && undoActorRaw.id) {
          undoActorActivityPubId = normalizeUrl(undoActorRaw.id);
      } else {
          this.logger.warn(`UndoHandler: Could not extract actor ID from undone activity.actor: ${JSON.stringify(undoActorRaw)}`);
          throw new BadRequestException('Could not extract actor ID from undone activity.');
      }

      // Robustly extract the object's ActivityPub ID from the undone activity
      let undoObjectRaw = undoneActivity.object || undoneActivity['as:object'] || undoneActivity.id || undoneActivity.url;
      let undoneObjectActivityPubId: string; // Declared here
      if (typeof undoObjectRaw === 'string') {
          undoneObjectActivityPubId = normalizeUrl(undoObjectRaw);
      } else if (typeof undoObjectRaw === 'object' && undoObjectRaw !== null && undoObjectRaw.id) {
          undoneObjectActivityPubId = normalizeUrl(undoObjectRaw.id);
      } else if (typeof undoObjectRaw === 'object' && undoObjectRaw !== null && undoObjectRaw.url) {
          undoneObjectActivityPubId = normalizeUrl(undoObjectRaw.url);
      } else {
          this.logger.warn(`UndoHandler: Could not extract object ID from undone activity.object: ${JSON.stringify(undoObjectRaw)}`);
          throw new BadRequestException('Could not extract object ID from undone activity.');
      }

      // Validate that the actor performing the Undo is the same as the actor of the activity being undone.
      // FIX: Use undoActorActivityPubId consistently
      if (undoActorActivityPubId !== normalizeUrl(actorPerformingUndo)) { // Compare normalized URLs
        this.logger.warn(`Security check failed: Undo actor '${actorPerformingUndo}' does not match actor of undone activity '${undoActorActivityPubId}'. Skipping processing.`);
        throw new BadRequestException('Undo actor and original activity actor are not the same. This is a potential security mismatch.');
      }

      switch (undoObjectType) {
        case 'Follow':
          this.logger.log(
            `Processing Undo Follow: '${undoActorActivityPubId}' unfollowing '${undoneObjectActivityPubId}'.`, // FIX: Use undoActorActivityPubId
          );
          const resultFollow = await this.followRepository.delete({
            followerActivityPubId: undoActorActivityPubId, // FIX: Use undoActorActivityPubId
            followedActivityPubId: undoneObjectActivityPubId,
          });
          if (resultFollow.affected && resultFollow.affected > 0) {
            this.logger.log(
              `Removed Follow relationship: '${undoActorActivityPubId}' is no longer following '${undoneObjectActivityPubId}'.`, // FIX: Use undoActorActivityPubId
            );
          } else {
            this.logger.log(
              `Attempted to Undo Follow, but relationship not found: '${undoActorActivityPubId}' -> '${undoneObjectActivityPubId}'. No action taken.`, // FIX: Use undoActorActivityPubId
            );
          }
          break;
        case 'Like':
          this.logger.log(
            `Processing Undo Like: '${undoActorActivityPubId}' unliking '${undoneObjectActivityPubId}'.`, // FIX: Use undoActorActivityPubId
          );
          const resultLike = await this.likeRepository.delete({
            likerActivityPubId: undoActorActivityPubId, // FIX: Use undoActorActivityPubId
            likedObjectActivityPubId: undoneObjectActivityPubId,
          });
          if (resultLike.affected && resultLike.affected > 0) {
            this.logger.log(
              `Removed Like relationship: '${undoActorActivityPubId}' no longer likes '${undoneObjectActivityPubId}'.`, // FIX: Use undoActorActivityPubId
            );
          } else {
            this.logger.log(
              `Attempted to Undo Like, but relationship not found: '${undoActorActivityPubId}' liked '${undoneObjectActivityPubId}'. No action taken.`, // FIX: Use undoActorActivityPubId
            );
          }
          break;
        case 'Announce':
          this.logger.log(
            `Processing Undo Announce from '${undoActorActivityPubId}' for object: '${undoneObjectActivityPubId}'.`, // FIX: Use undoActorActivityPubId
          );
          const resultAnnounce = await this.activityRepository.delete({
            type: 'Announce',
            actorActivityPubId: undoActorActivityPubId, // FIX: Use undoActorActivityPubId
            objectActivityPubId: undoneObjectActivityPubId,
          });
          if (resultAnnounce.affected && resultAnnounce.affected > 0) {
            this.logger.log(
              `Removed Announce activity: '${undoActorActivityPubId}' no longer announces '${undoneObjectActivityPubId}'.`, // FIX: Use undoActorActivityPubId
            );
          } else {
            this.logger.log(
              `Attempted to Undo Announce, but activity not found: '${undoActorActivityPubId}' announced '${undoneObjectActivityPubId}'. No action taken.`, // FIX: Use undoActorActivityPubId
            );
          }
          break;
        case 'Block':
          this.logger.log(
            `Processing Undo Block: '${undoActorActivityPubId}' unblocking '${undoneObjectActivityPubId}'.`, // FIX: Use undoActorActivityPubId
          );
          const resultBlock = await this.blockRepository.delete({
            blockerActivityPubId: undoActorActivityPubId, // FIX: Use undoActorActivityPubId
            blockedActivityPubId: undoneObjectActivityPubId,
          });
          if (resultBlock.affected && resultBlock.affected > 0) {
            this.logger.log(
              `Removed Block relationship: '${undoActorActivityPubId}' no longer blocks '${undoneObjectActivityPubId}'.`, // FIX: Use undoActorActivityPubId
            );
          } else {
            this.logger.log(
              `Attempted to Undo Block, but relationship not found: '${undoActorActivityPubId}' blocked '${undoneObjectActivityPubId}'. No action taken.`, // FIX: Use undoActorActivityPubId
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
