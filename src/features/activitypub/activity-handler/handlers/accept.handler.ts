import { Repository } from 'typeorm';
import { IActivityHandler } from '../interfaces/activity-handler.interface';
import { ActivityHandler } from '../../../../shared/decorators/activity-handler.decorator';
import { FollowEntity } from '../../entities/follow.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { LoggerService } from 'src/shared/services/logger.service';

@ActivityHandler('Accept')
export class AcceptHandler implements IActivityHandler {
  public readonly type = 'Accept';

  constructor(
    @InjectRepository(FollowEntity)
    private readonly followRepository: Repository<FollowEntity>,
    private readonly logger: LoggerService, // Injects custom logger
  ) {
    this.logger.setContext('AcceptHandler'); // Sets context for the logger
  }

  async handleInbox(activity: any): Promise<void> {
    const actorActivityPubId = String(activity.actorActivityPubId);
    const objectActivityPubId =
      typeof activity.objectActivityPubId === 'string'
        ? String(activity.objectActivityPubId)
        : undefined;

    this.logger.log(
      `Handling 'Accept' activity from '${actorActivityPubId}' for object: '${objectActivityPubId}'.`,
    );
    if (
      activity.data.object &&
      typeof activity.data.object === 'object' &&
      activity.data.object.type
    ) {
      const acceptedObjectType = activity.data.object.type;
      const acceptedObjectActor = String(activity.data.object.actor);
      const acceptedObjectTarget = activity.data.object.object
        ? String(activity.data.object.object)
        : undefined;

      switch (acceptedObjectType) {
        case 'Follow':
          this.logger.log(
            `Received Accept for Follow from '${acceptedObjectActor}' to '${acceptedObjectTarget}'. This confirms the remote instance accepted our follow request.`,
          );
          // When we receive an Accept for a Follow, it means the remote instance has accepted our follow.
          // We need to update the status of our *outgoing* follow request (where our actor is the follower).
          const followToAccept = await this.followRepository.findOne({
            where: {
              // The remote actor (acceptedObjectActor) is the one being followed by our local actor (acceptedObjectTarget)
              // This is because the 'object' of the Accept activity is the *original Follow activity*,
              // where 'actor' is the one who initiated the follow (our local actor),
              // and 'object' is the one being followed (the remote actor).
              followerActivityPubId: acceptedObjectTarget, // Our local actor's ID
              followedActivityPubId: acceptedObjectActor, // The remote actor's ID
              status: 'pending', // Only update if it's currently pending
            },
          });
          if (followToAccept) {
            followToAccept.status = 'accepted';
            await this.followRepository.save(followToAccept);
            this.logger.log(
              `Updated Follow relationship status to 'accepted' for: '${acceptedObjectTarget}' -> '${acceptedObjectActor}'.`,
            );
          } else {
            this.logger.warn(
              `Could not find pending Follow relationship to accept for: '${acceptedObjectTarget}' -> '${acceptedObjectActor}'. It might already be accepted or not exist.`,
            );
          }
          break;
        case 'Announce':
          this.logger.log(
            `Received Accept for Announce from '${acceptedObjectActor}' for object '${acceptedObjectTarget}'.`,
          );
          break;
        case 'Like':
          this.logger.log(
            `Received Accept for Like from '${acceptedObjectActor}' for object '${acceptedObjectTarget}'.`,
          );
          break;
        default:
          this.logger.log(
            `Accept activity from '${actorActivityPubId}' for unhandled object type: '${acceptedObjectType}'. Skipping specific processing.`,
          );
          break;
      }
    } else {
      this.logger.warn(
        `Malformed Accept activity received from '${actorActivityPubId}': missing object or object type. Skipping processing. Activity object: ${JSON.stringify(activity.data.object)}`,
      );
    }
    return;
  }

  async handleOutbox(activity: any): Promise<void> {
    console.log('Handling outbox Accept activity:', activity);
  }
}
