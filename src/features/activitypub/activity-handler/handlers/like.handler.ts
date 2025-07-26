// src/features/activitypub/activity-handler/handlers/like.handler.ts

import { IActivityHandler } from '../interfaces/activity-handler.interface';
import { ActivityHandler } from '../../../../shared/decorators/activity-handler.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LikeEntity } from '../../entities/like.entity';
import { RemoteObjectService } from '../../../../core/services/remote-object.service';
import { LoggerService } from 'src/shared/services/logger.service';

/**
 * LikeHandler
 *
 * Handles incoming 'Like' activities from the ActivityPub inbox.
 * When a remote actor 'likes' one of our local objects (e.g., a Note, an edu:Flashcard),
 * this handler creates a local `LikeEntity` record to track that interaction.
 */
@ActivityHandler('Like')
export class LikeHandler implements IActivityHandler {
  public readonly type = 'Like';

  constructor(
    @InjectRepository(LikeEntity)
    private readonly likeRepository: Repository<LikeEntity>,
    private readonly remoteObjectService: RemoteObjectService, // Used to fetch the liked object if it's remote
    private readonly logger: LoggerService, // Injects custom logger
  ) {
    this.logger.setContext('LikeHandler');
  }

  /**
   * Handles an incoming 'Like' activity received in the inbox.
   *
   * @param activity The parsed ActivityPub activity object.
   */
  async handleInbox(activity: any): Promise<void> {
    this.logger.debug(`Received Like activity: ${JSON.stringify(activity)}`);

    const likerActivityPubId = String(activity.actorActivityPubId);
    const likedObjectActivityPubId = String(activity.objectActivityPubId);

    this.logger.log(
      `Handling 'Like' activity from '${likerActivityPubId}' for object: '${likedObjectActivityPubId}'.`,
    );

    // 1. Deduplication: Check if this specific like relationship already exists
    const existingLike = await this.likeRepository.findOne({
      where: {
        likerActivityPubId: likerActivityPubId,
        likedObjectActivityPubId: likedObjectActivityPubId,
      },
    });

    if (existingLike) {
      this.logger.warn(
        `Like from '${likerActivityPubId}' for object '${likedObjectActivityPubId}' already exists. Skipping.`,
      );
      return;
    }

    // 2. Optional: Fetch and store the liked object if it's not local
    // This ensures we have a local representation of the object being liked,
    // which is important for displaying local counts or context.
    const likedContentObject = await this.remoteObjectService.fetchAndStoreRemoteObject(
      likedObjectActivityPubId,
    ).catch(e => {
        this.logger.warn(`Failed to fetch or store liked object '${likedObjectActivityPubId}': ${e.message}`);
        return null; // Don't block if we can't fetch the object
    });

    // 3. Store the Like relationship
    const newLike = this.likeRepository.create({
      likerActivityPubId: likerActivityPubId,
      likedObjectActivityPubId: likedObjectActivityPubId,
      // If likedContentObject is available, link it
      ...(likedContentObject && { likedObject: likedContentObject }),
      // The `liker` relationship will be populated by TypeORM if liker is a local actor,
      // otherwise, we just store their ActivityPub ID.
    });

    await this.likeRepository.save(newLike);
    this.logger.log(
      `Stored new Like relationship by '${likerActivityPubId}' for object '${likedObjectActivityPubId}'.`,
    );
  }

  /**
   * Handles outgoing 'Like' activities from the outbox.
   * (Typically, this handler would not perform direct actions; the outbox processor
   * handles the actual dispatching based on the activity data prepared by a service.)
   *
   * @param activity The parsed ActivityPub activity object.
   */
  async handleOutbox(activity: any): Promise<void> {
    this.logger.log('Handling outbox Like activity (no specific action here, outbox processor dispatches).');
    // For a 'Like' activity being sent from the outbox, the main action
    // (creating the local Like record and queuing the activity) is typically
    // performed by a service (e.g., FlashcardService.dispatchLikeActivity)
    // before it reaches the OutboxProcessor.
    // This handler's `handleOutbox` method might be used for specific post-dispatch
    // cleanup or updates, but for MVP, no action is needed here.
  }
}
