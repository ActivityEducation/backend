import { IActivityHandler } from '../interfaces/activity-handler.interface';
import { ActivityHandler } from '../../../../shared/decorators/activity-handler.decorator';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FollowEntity } from '../../entities/follow.entity';
import { ActorEntity } from '../../entities/actor.entity';
import { randomUUID } from 'crypto'; // Import randomUUID for generating IDs
import { LoggerService } from 'src/shared/services/logger.service';

@ActivityHandler('Follow')
export class FollowHandler implements IActivityHandler {
  public readonly type = 'Follow';

  constructor(
    @InjectRepository(ActorEntity)
    private readonly actorRepository: Repository<ActorEntity>,
    @InjectRepository(FollowEntity)
    private readonly followRepository: Repository<FollowEntity>,
    @InjectQueue('outbox') private readonly outboxQueue: Queue, // Injects the 'outbox' queue (needed for sending Accept activities)
    private readonly logger: LoggerService, // Injects custom logger
  ) {
    this.logger.setContext('FollowHandler');
  }

  async handleInbox(activity: any): Promise<void> {
    this.logger.debug(`Received Follow activity: ${JSON.stringify(activity)}`);

    // 'activity' here is the ActivityEntity instance, which contains the original JSON-LD in 'activity.data'.
    // Extract actor and object IDs from the 'data' payload for robustness, as this is the source of truth.
    // Ensure they are converted to strings.
    const actorActivityPubId = activity.data?.['as:actor'].id
    const objectActivityPubId = activity.data?.['as:object'].id

    this.logger.log(
      `Handling 'Follow' activity from '${actorActivityPubId}' to '${objectActivityPubId}'.`,
    );

    // Check if the objectActivityPubId is valid (not null, undefined, or empty string)
    if (!objectActivityPubId || objectActivityPubId === 'null' || objectActivityPubId === 'undefined') {
      this.logger.warn(
        `Follow activity missing object (target actor) ID or it is invalid. Skipping processing.`,
      );
      return;
    }

    // Find the local actor that is being followed
    const localActor = await this.actorRepository.findOne({
      where: { activityPubId: objectActivityPubId },
    });

    if (localActor) {
      const existingFollow = await this.followRepository.findOne({
        where: {
          followerActivityPubId: actorActivityPubId,
          followedActivityPubId: objectActivityPubId,
        },
      });

      if (!existingFollow) {
        const newFollow = this.followRepository.create({
          followerActivityPubId: actorActivityPubId,
          followedActivityPubId: objectActivityPubId,
          status: 'pending',
        });
        await this.followRepository.save(newFollow);
        this.logger.log(
          `Stored new Follow relationship: '${actorActivityPubId}' is now following '${objectActivityPubId}'. Status: 'pending'.`,
        );

        // Construct the Accept activity
        const acceptActivity = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          id: `${localActor.activityPubId}/activities/${randomUUID()}/accept`,
          type: 'Accept',
          actor: localActor.activityPubId,
          // The 'object' of an Accept activity is the *original* activity being accepted.
          // So, use activity.data, which contains the full original Follow activity JSON-LD.
          object: activity.data,
          to: [actorActivityPubId],
        };

        // Enqueue the Accept activity for delivery.
        // We pass the full JSON-LD payload directly for now, as it's a new activity not yet in DB.
        // In a more robust system, you might save this Accept activity to your DB first too.
        await this.outboxQueue.add('deliverActivity', {
          activity: acceptActivity,
          actorId: localActor.id, // Pass local actor's internal ID for signing
        });
        this.logger.log(
          `Enqueued 'Accept' activity for actor '${actorActivityPubId}' in response to Follow.`,
        );

        // IMPORTANT: After sending our Accept, we locally mark the follow as accepted.
        // This is because the remote instance's Accept of our Accept is just a confirmation.
        newFollow.status = 'accepted';
        await this.followRepository.save(newFollow);
        this.logger.log(
          `Locally updated new Follow relationship to 'accepted' after sending Accept: '${actorActivityPubId}' -> '${objectActivityPubId}'.`,
        );
      } else if (existingFollow.status === 'pending') {
        // If a follow relationship exists and is pending, and we receive another Follow,
        // it implies the remote side might not have received our Accept, or is re-sending.
        // We should ensure the status is accepted and re-send the Accept.
        existingFollow.status = 'accepted';
        await this.followRepository.save(existingFollow);
        this.logger.log(
          `Updated existing pending Follow relationship to 'accepted': '${actorActivityPubId}' -> '${objectActivityPubId}'. Re-enqueuing Accept.`,
        );

        const acceptActivity = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          id: `${localActor.activityPubId}/activities/${randomUUID()}/accept`, // New ID to ensure it's treated as a distinct message
          type: 'Accept',
          actor: localActor.activityPubId,
          object: activity.data, // Original Follow activity JSON-LD
          to: [actorActivityPubId],
        };
        await this.outboxQueue.add('deliverActivity', {
          activity: acceptActivity,
          actorId: localActor.id, // Pass local actor's internal ID for signing
        });
        this.logger.log(
          `Re-enqueued 'Accept' activity for actor '${actorActivityPubId}' in response to existing pending Follow.`
        );
      } else {
        this.logger.log(
          `Follow relationship already exists and is 'accepted': '${actorActivityPubId}' -> '${objectActivityPubId}'. No new action taken.`,
        );
      }
    } else {
      this.logger.warn(
        `Follow activity object '${objectActivityPubId}' is not a local actor. Cannot process follow locally.`,
      );
    }
    return;
  }

  async handleOutbox(activity: any): Promise<void> {
    console.log('Handling outbox follow activity:', activity);
  }
}
