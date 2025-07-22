import { Repository } from 'typeorm';
import { IActivityHandler } from '../interfaces/activity-handler.interface';
import { ActivityHandler } from '../../../../shared/decorators/activity-handler.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { FollowEntity } from '../../entities/follow.entity';
import { LoggerService } from 'src/shared/services/logger.service';

@ActivityHandler('Reject')
export class RejectHandler implements IActivityHandler {
  public readonly type = 'Reject';

  constructor(
    @InjectRepository(FollowEntity)
    private readonly followRepository: Repository<FollowEntity>,
    private readonly logger: LoggerService, // Injects custom logger
  ) {
    this.logger.setContext('RejectHandler'); // Sets context for the logger
  }

  async handleInbox(activity: any): Promise<void> {
    this.logger.debug(`Received Reject activity: ${JSON.stringify(activity)}`);
    
    const actorActivityPubId = String(activity.actorActivityPubId);
    const objectActivityPubId =
      typeof activity.objectActivityPubId === 'string'
        ? String(activity.objectActivityPubId)
        : undefined;

    this.logger.log(
      `Handling 'Reject' activity from '${actorActivityPubId}' for object: '${objectActivityPubId}'.`,
    );
    if (
      activity.data.object &&
      typeof activity.data.object === 'object' &&
      activity.data.object.type
    ) {
      const rejectedObjectType = activity.data.object.type;
      const rejectedObjectActor = String(activity.data.object.actor);
      const rejectedObjectTarget = activity.data.object.object
        ? String(activity.data.object.object)
        : undefined;

      switch (rejectedObjectType) {
        case 'Follow':
          this.logger.log(
            `Received Reject for Follow from '${rejectedObjectActor}' to '${rejectedObjectTarget}'. This means our follow request was denied.`,
          );
          // When we receive a Reject for a Follow, it means the remote instance has rejected our follow.
          // We need to update the status of our *outgoing* follow request (where our actor is the follower).
          const followToReject = await this.followRepository.findOne({
            where: {
              followerActivityPubId: rejectedObjectTarget, // Our local actor's ID
              followedActivityPubId: rejectedObjectActor, // The remote actor's ID
              status: 'pending', // Only update if it's pending
            },
          });
          if (followToReject) {
            followToReject.status = 'rejected';
            await this.followRepository.save(followToReject);
            this.logger.log(
              `Updated Follow relationship status to 'rejected' for: '${rejectedObjectTarget}' -> '${rejectedObjectActor}'.`,
            );
          } else {
            this.logger.warn(
              `Could not find pending Follow relationship to reject for: '${rejectedObjectTarget}' -> '${rejectedObjectActor}'. It might already be rejected or not exist.`,
            );
          }
          break;
        case 'Announce':
          this.logger.log(
            `Received Reject for Announce from '${rejectedObjectActor}' for object '${rejectedObjectTarget}'.`,
          );
          break;
        case 'Like':
          this.logger.log(
            `Received Reject for Like from '${rejectedObjectActor}' for object '${rejectedObjectTarget}'.`,
          );
          break;
        default:
          this.logger.log(
            `Reject activity from '${actorActivityPubId}' for unhandled object type: '${rejectedObjectType}'. Skipping specific processing.`,
          );
          break;
      }
    } else {
      this.logger.warn(
        `Malformed Reject activity received from '${actorActivityPubId}': missing object or object type. Skipping processing. Activity object: ${JSON.stringify(activity.data.object)}`,
      );
    }
    return;
  }

  async handleOutbox(activity: any): Promise<void> {
    console.log('Handling outbox Reject activity:', activity);
  }
}
