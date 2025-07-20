import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityEntity } from '../entities/activity.entity';
import { ActorEntity } from '../entities/actor.entity';
import { FollowEntity } from '../entities/follow.entity';
import { ContentObjectEntity } from '../entities/content-object.entity';
import { LikeEntity } from '../entities/like.entity';
import { BlockEntity } from '../entities/block.entity';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { randomUUID } from 'crypto'; // Import randomUUID for generating IDs
import { AppService } from '../../../core/app.service';
import { CustomLogger } from '../../../core/custom-logger.service';
import { ModerationService } from '../../../features/moderation/moderation.service';
import { RemoteObjectService } from '../../../core/remote-object.service';

@Processor('inbox') // Designates this class as a BullMQ processor for the 'inbox' queue
export class InboxProcessor extends WorkerHost {
  constructor(
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: Repository<ActivityEntity>,
    @InjectRepository(ActorEntity)
    private readonly actorRepository: Repository<ActorEntity>,
    @InjectRepository(FollowEntity)
    private readonly followRepository: Repository<FollowEntity>,
    @InjectRepository(ContentObjectEntity)
    private readonly contentObjectRepository: Repository<ContentObjectEntity>,
    @InjectRepository(LikeEntity)
    private readonly likeRepository: Repository<LikeEntity>,
    @InjectRepository(BlockEntity)
    private readonly blockRepository: Repository<BlockEntity>,
    @InjectQueue('outbox') private readonly outboxQueue: Queue, // Injects the 'outbox' queue (needed for sending Accept activities)
    private readonly appService: AppService, // Injects AppService (needed for signing outgoing activities)
    private readonly logger: CustomLogger, // Injects custom logger
    private readonly moderationService: ModerationService, // Injects ModerationService
    private readonly remoteObjectService: RemoteObjectService, // Injects RemoteObjectService
  ) {
    super();
    this.logger.setContext('InboxProcessor'); // Sets context for the logger
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case "processActivity":
        return this.processInboxActivity(job);
    }
  }

  /**
   * Resolves a remote actor's inbox URL from their ActivityPub profile.
   * Includes retry logic with exponential backoff.
   * Also attempts to find a sharedInbox if available (NodeInfo 2.0 or actor's 'endpoints').
   * @param actorId The ActivityPub URI of the remote actor.
   * @returns The inbox URL as a string, or null if not found/resolvable.
   */
  private async getRemoteActorInbox(actorId: string): Promise<string | null> {
    const MAX_RETRIES = 3;
    let retries = 0;
    while (retries < MAX_RETRIES) {
      try {
        this.logger.debug(`Resolving remote actor inbox for: '${actorId}' (Attempt ${retries + 1}/${MAX_RETRIES}).`);
        const response = await fetch(actorId, {
          headers: { Accept: 'application/activity+json, application/ld+json' },
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch remote actor profile '${actorId}': ${response.status} ${response.statusText} - ${errorText}`);
        }
        const actorProfile = await response.json();
        
        if (actorProfile.endpoints?.sharedInbox) {
          this.logger.log(`Resolved sharedInbox for '${actorId}': '${actorProfile.endpoints.sharedInbox}'.`);
          return String(actorProfile.endpoints.sharedInbox);
        } else if (actorProfile.inbox) {
          this.logger.log(`Resolved individual inbox for '${actorId}': '${actorProfile.inbox}'.`);
          return String(actorProfile.inbox);
        }
        this.logger.warn(`Remote actor '${actorId}' profile has no inbox or sharedInbox property. Cannot determine inbox URL.`);
        return null;
      } catch (error) {
        this.logger.error(`Error resolving remote actor inbox for '${actorId}' (Attempt ${retries + 1}): ${error.message}.`, error.stack);
        retries++;
        if (retries < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries - 1)));
        }
      }
    }
    this.logger.error(`Failed to resolve remote actor inbox after ${MAX_RETRIES} attempts: '${actorId}'.`);
    return null;
  }

  /**
   * Processes an incoming ActivityPub activity received in an inbox.
   * This method handles various activity types by performing appropriate database operations
   * and potentially enqueuing further actions (e.g., sending an Accept activity).
   * @param job The BullMQ job containing the activity ID to process.
   * @throws Error if processing fails, to ensure BullMQ marks the job as failed and handles retries.
   */
  async processInboxActivity(job: Job<{ activityId: string }>) {
    const { activityId } = job.data;
    this.logger.log(`Starting processing for inbox activity job: '${job.id}', Activity DB ID: '${activityId}'.`);

    const activity = await this.activityRepository.findOne({ where: { id: activityId } });
    if (!activity) {
      this.logger.error(`Activity with DB ID '${activityId}' not found in database. Skipping processing.`);
      return;
    }

    this.logger.debug(`Processing Activity (DB ID: '${activity.id}', AP ID: '${activity.activityPubId}', Type: '${activity.type}', Actor: '${activity.actorActivityPubId}').`);

    const activityType = activity.type;
    const actorActivityPubId = String(activity.actorActivityPubId);
    const objectActivityPubId = typeof activity.objectActivityPubId === 'string' ? String(activity.objectActivityPubId) : undefined;
    const inReplyToActivityPubId = typeof activity.inReplyToActivityPubId === 'string' ? String(activity.inReplyToActivityPubId) : undefined;

    try {
      switch (activityType) {
        case 'Follow':
          this.logger.log(`Handling 'Follow' activity from '${actorActivityPubId}' to '${objectActivityPubId}'.`);
          if (!objectActivityPubId) {
            this.logger.warn(`Follow activity missing object (target actor) ID. Skipping processing.`);
            break;
          }
          const localActor = await this.actorRepository.findOne({ where: { activityPubId: objectActivityPubId } });
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
              this.logger.log(`Stored new Follow relationship: '${actorActivityPubId}' is now following '${objectActivityPubId}'. Status: 'pending'.`);

              const acceptActivity = {
                "@context": "https://www.w3.org/ns/activitystreams",
                "id": `${localActor.activityPubId}/activities/${randomUUID()}/accept`,
                "type": "Accept",
                "actor": localActor.activityPubId,
                "object": activity.data,
                "to": [actorActivityPubId]
              };
              await this.outboxQueue.add('deliverActivity', { activity: acceptActivity });
              this.logger.log(`Enqueued 'Accept' activity for actor '${actorActivityPubId}' in response to Follow.`);

              // IMPORTANT: After sending our Accept, we locally mark the follow as accepted.
              // This is because the remote instance's Accept of our Accept is just a confirmation.
              newFollow.status = 'accepted';
              await this.followRepository.save(newFollow);
              this.logger.log(`Locally updated new Follow relationship to 'accepted' after sending Accept: '${actorActivityPubId}' -> '${objectActivityPubId}'.`);

            } else if (existingFollow.status === 'pending') {
              // If a follow relationship exists and is pending, and we receive another Follow,
              // it implies the remote side might not have received our Accept, or is re-sending.
              // We should ensure the status is accepted and re-send the Accept.
              existingFollow.status = 'accepted';
              await this.followRepository.save(existingFollow);
              this.logger.log(`Updated existing pending Follow relationship to 'accepted': '${actorActivityPubId}' -> '${objectActivityPubId}'. Re-enqueuing Accept.`);

              const acceptActivity = {
                "@context": "https://www.w3.org/ns/activitystreams",
                "id": `${localActor.activityPubId}/activities/${randomUUID()}/accept`, // New ID to ensure it's treated as a distinct message
                "type": "Accept",
                "actor": localActor.activityPubId,
                "object": activity.data,
                "to": [actorActivityPubId]
              };
              await this.outboxQueue.add('deliverActivity', { activity: acceptActivity });
              this.logger.log(`Re-enqueued 'Accept' activity for actor '${actorActivityPubId}' in response to existing pending Follow.`);
            }
            else {
              this.logger.log(`Follow relationship already exists and is 'accepted': '${actorActivityPubId}' -> '${objectActivityPubId}'. No new action taken.`);
            }
          } else {
            this.logger.warn(`Follow activity object '${objectActivityPubId}' is not a local actor. Cannot process follow locally.`);
          }
          break;

        case 'Create':
          this.logger.log(`Handling 'Create' activity from '${actorActivityPubId}'.`);
          // Ensure activity.data.object exists and has an ID. The 'object' is the content being created.
          if (activity.data.object && typeof activity.data.object === 'object' && activity.data.object.id) {
            const createdObject = activity.data.object;
            const createdObjectId = String(createdObject.id);

            // Check if this content object already exists to prevent duplicates
            const existingContentObject = await this.contentObjectRepository.findOne({ where: { activityPubId: createdObjectId } });
            if (!existingContentObject) {
              // Create and store the new content object
              const contentObject = this.contentObjectRepository.create({
                activityPubId: createdObjectId,
                type: createdObject.type || 'Note', // Default to 'Note' if type is missing
                attributedToActivityPubId: actorActivityPubId, // The actor who created it
                inReplyToActivityPubId: createdObject.inReplyTo ? String(createdObject.inReplyTo) : undefined, // If it's a reply
                data: createdObject, // Store the full object payload
              });
              await this.contentObjectRepository.save(contentObject);
              this.logger.log(`Stored new content object (Type: '${contentObject.type}', ID: '${contentObject.activityPubId}') from '${actorActivityPubId}'.`);
            } else {
              this.logger.log(`Content object '${createdObjectId}' from Create activity already exists. Skipping storage.`);
            }

            // If the created object is a reply to a remote object, try to fetch and store that remote parent object.
            // This helps build local context for conversation threads.
            if (createdObject.inReplyTo && typeof createdObject.inReplyTo === 'string') {
              this.logger.debug(`Create activity object is a reply to '${createdObject.inReplyTo}'. Attempting to fetch and store remote parent object.`);
              await this.remoteObjectService.fetchAndStoreRemoteObject(String(createdObject.inReplyTo));
            }

          } else {
            this.logger.warn(`Received Create activity from '${actorActivityPubId}' with unhandled or malformed object (missing ID or not an object). Skipping storage. Activity object: ${JSON.stringify(activity.data.object)}`);
          }
          break;

        case 'Announce':
          this.logger.log(`Handling 'Announce' activity from '${actorActivityPubId}' for object: '${objectActivityPubId}'.`);
          if (objectActivityPubId) {
            // Generate a unique ID for the Announce activity if not provided, for deduplication.
            const announceActivityId = activity.activityPubId ? String(activity.activityPubId) : `${actorActivityPubId}/announces/${randomUUID()}`;
            const existingAnnounceActivity = await this.activityRepository.findOne({ where: { activityPubId: announceActivityId } });
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
                this.logger.log(`Stored Announce activity (ID: '${announceActivityId}') by '${actorActivityPubId}' for object '${objectActivityPubId}'.`);
            } else {
                this.logger.log(`Announce activity '${announceActivityId}' already exists. No new action taken.`);
            }

            // Fetch and store the announced object if it's not local. This ensures we have the content locally.
            await this.remoteObjectService.fetchAndStoreRemoteObject(objectActivityPubId);

          } else {
            this.logger.warn(`Announce activity from '${actorActivityPubId}' missing object ID. Skipping processing.`);
          }
          break;

        case 'Like':
            this.logger.log(`Handling 'Like' activity from '${actorActivityPubId}' for object: '${objectActivityPubId}'.`);
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
                    this.logger.log(`Stored new Like relationship: '${actorActivityPubId}' liked '${objectActivityPubId}'.`);
                } else {
                    this.logger.log(`Like relationship already exists: '${actorActivityPubId}' liked '${objectActivityPubId}'. No new action taken.`);
                }

                // Fetch and store the liked object if it's not local. This ensures we have the content locally.
                await this.remoteObjectService.fetchAndStoreRemoteObject(objectActivityPubId);

            } else {
              this.logger.warn(`Like activity from '${actorActivityPubId}' missing object ID. Skipping processing.`);
            }
            break;

        case 'Block':
            this.logger.log(`Handling 'Block' activity from '${actorActivityPubId}' for object: '${objectActivityPubId}'.`);
            if (objectActivityPubId) {
              // Check if this block relationship already exists
              const existingBlock = await this.blockRepository.findOne({
                where: {
                  blockerActivityPubId: actorActivityPubId,
                  blockedActivityPubId: objectActivityPubId,
                },
              });

              if (!existingBlock) {
                // Store the new Block relationship
                const newBlock = this.blockRepository.create({
                  blockerActivityPubId: actorActivityPubId,
                  blockedActivityPubId: objectActivityPubId,
                });
                await this.blockRepository.save(newBlock);
                this.logger.log(`Stored new Block relationship: '${actorActivityPubId}' blocked '${objectActivityPubId}'.`);
              } else {
                this.logger.log(`Block relationship already exists: '${actorActivityPubId}' blocked '${objectActivityPubId}'. No new action taken.`);
              }
            } else {
              this.logger.warn(`Block activity from '${actorActivityPubId}' missing object (blocked actor) ID. Skipping processing.`);
            }
            break;

        case 'Delete':
            this.logger.log(`Handling 'Delete' activity from '${actorActivityPubId}' for object: '${objectActivityPubId}'.`);
            if (objectActivityPubId) {
                // If the deleted object is present locally, soft-delete it.
                const localContentObject = await this.contentObjectRepository.findOne({ where: { activityPubId: objectActivityPubId } });
                if (localContentObject) {
                    await this.contentObjectRepository.softDelete(localContentObject.id);
                    this.logger.log(`Soft-deleted local content object (ID: '${objectActivityPubId}') due to Delete activity from '${actorActivityPubId}'.`);
                } else {
                    this.logger.log(`Received Delete activity for non-local or non-existent object: '${objectActivityPubId}'. No local action taken.`);
                }
                // TODO: Also delete associated activities (e.g., Likes, Announce) related to this object.
            } else {
              this.logger.warn(`Delete activity from '${actorActivityPubId}' missing object ID. Skipping processing.`);
            }
            break;

        case 'Update':
            this.logger.log(`Handling 'Update' activity from '${actorActivityPubId}' for object: '${objectActivityPubId}'.`);
            // Ensure activity.data.object exists and has an ID. The 'object' is the updated content.
            if (activity.data.object && typeof activity.data.object === 'object' && activity.data.object.id) {
                const updatedObjectData = activity.data.object;
                const updatedObjectId = String(updatedObjectData.id);

                // Find the local content object to update
                const localContentObject = await this.contentObjectRepository.findOne({ where: { activityPubId: updatedObjectId } });
                if (localContentObject) {
                    // Update the entire 'data' JSONB payload of the content object with the new data.
                    // This assumes the incoming 'object' contains the full, updated representation.
                    localContentObject.data = updatedObjectData;
                    // Also update the type and attributedTo if they changed, though typically they remain constant.
                    localContentObject.type = updatedObjectData.type || localContentObject.type;
                    localContentObject.attributedToActivityPubId = updatedObjectData.attributedTo || localContentObject.attributedToActivityPubId;
                    await this.contentObjectRepository.save(localContentObject);
                    this.logger.log(`Updated local content object (ID: '${updatedObjectId}', Type: '${localContentObject.type}') due to Update activity from '${actorActivityPubId}'.`);
                } else {
                    this.logger.log(`Received Update activity for non-local or non-existent object: '${updatedObjectId}'. Skipping local update.`);
                }
            } else {
              this.logger.warn(`Update activity from '${actorActivityPubId}' missing object or object ID. Skipping processing. Activity object: ${JSON.stringify(activity.data.object)}`);
            }
            break;

        case 'Move':
            this.logger.log(`Handling 'Move' activity from '${actorActivityPubId}' for object: '${objectActivityPubId}'.`);
            // Ensure actor, object (old actor ID), and target (new actor ID) properties exist in the activity data.
            // This activity signifies an actor changing their ActivityPub ID (e.g., due to domain migration).
            if (activity.data.actor && activity.data.object && activity.data.target) {
                const oldActorId = String(activity.data.object); // The object of a Move activity is the old actor ID
                const newActorId = String(activity.data.target); // The target is the new actor ID

                // Find the local actor record that needs to be updated
                const localActorToMove = await this.actorRepository.findOne({ where: { activityPubId: oldActorId } });
                if (localActorToMove) {
                    this.logger.log(`Local actor '${oldActorId}' is moving to '${newActorId}'. Updating local records.`);
                    // Update the actor's ActivityPub ID and its 'data' payload
                    localActorToMove.activityPubId = newActorId;
                    localActorToMove.data = { ...localActorToMove.data, id: newActorId }; // Update ID in JSONB data
                    await this.actorRepository.save(localActorToMove);

                    // Update all associated records in other tables that reference the old actor ID.
                    // This ensures referential integrity and correct linking to the new actor ID.
                    await this.activityRepository.update(
                        { actorActivityPubId: oldActorId },
                        { actorActivityPubId: newActorId }
                    );
                    await this.contentObjectRepository.update(
                        { attributedToActivityPubId: oldActorId },
                        { attributedToActivityPubId: newActorId }
                    );
                    await this.followRepository.update(
                        { followerActivityPubId: oldActorId },
                        { followerActivityPubId: newActorId }
                    );
                    await this.followRepository.update(
                        { followedActivityPubId: oldActorId },
                        { followedActivityPubId: newActorId }
                    );
                    await this.likeRepository.update(
                        { likerActivityPubId: oldActorId },
                        { likerActivityPubId: newActorId }
                    );
                    await this.blockRepository.update(
                        { blockerActivityPubId: oldActorId },
                        { blockerActivityPubId: newActorId }
                    );
                    await this.blockRepository.update(
                        { blockedActivityPubId: oldActorId },
                        { blockedActivityPubId: newActorId }
                    );

                    this.logger.log(`Successfully moved local actor records from '${oldActorId}' to '${newActorId}'.`);
                } else {
                    this.logger.log(`Received Move activity for remote actor '${oldActorId}' to '${newActorId}'. No local actor to update.`);
                }
            } else {
                this.logger.warn(`Malformed Move activity received from '${actorActivityPubId}': missing actor, object, or target. Skipping processing. Activity data: ${JSON.stringify(activity.data)}`);
            }
            break;

        case 'Flag':
            this.logger.log(`Handling 'Flag' activity from '${actorActivityPubId}' for object: '${objectActivityPubId}'.`);
            if (objectActivityPubId) {
              // Production Grade Improvement: Trigger moderation workflow.
              // The 'category' of the flag could be inferred from the activity data or a separate field.
              const flagCategory = activity.data.category || 'unspecified'; // Example: use a 'category' field in the flag activity
              await this.moderationService.flagObject(objectActivityPubId, actorActivityPubId, flagCategory, activity.data);
              this.logger.log(`Object '${objectActivityPubId}' flagged by '${actorActivityPubId}' with category '${flagCategory}'. Details enqueued for moderation review.`);
            } else {
              this.logger.warn(`Flag activity from '${actorActivityPubId}' missing object ID. Skipping processing.`);
            }
            break;

        case 'Accept':
            this.logger.log(`Handling 'Accept' activity from '${actorActivityPubId}' for object: '${objectActivityPubId}'.`);
            if (activity.data.object && typeof activity.data.object === 'object' && activity.data.object.type) {
                const acceptedObjectType = activity.data.object.type;
                const acceptedObjectActor = String(activity.data.object.actor);
                const acceptedObjectTarget = activity.data.object.object ? String(activity.data.object.object) : undefined;

                switch (acceptedObjectType) {
                    case 'Follow':
                        this.logger.log(`Received Accept for Follow from '${acceptedObjectActor}' to '${acceptedObjectTarget}'. This confirms the remote instance accepted our follow request.`);
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
                          this.logger.log(`Updated Follow relationship status to 'accepted' for: '${acceptedObjectTarget}' -> '${acceptedObjectActor}'.`);
                        } else {
                          this.logger.warn(`Could not find pending Follow relationship to accept for: '${acceptedObjectTarget}' -> '${acceptedObjectActor}'. It might already be accepted or not exist.`);
                        }
                        break;
                    case 'Announce':
                        this.logger.log(`Received Accept for Announce from '${acceptedObjectActor}' for object '${acceptedObjectTarget}'.`);
                        break;
                    case 'Like':
                        this.logger.log(`Received Accept for Like from '${acceptedObjectActor}' for object '${acceptedObjectTarget}'.`);
                        break;
                    default:
                        this.logger.log(`Accept activity from '${actorActivityPubId}' for unhandled object type: '${acceptedObjectType}'. Skipping specific processing.`);
                        break;
                }
            } else {
                this.logger.warn(`Malformed Accept activity received from '${actorActivityPubId}': missing object or object type. Skipping processing. Activity object: ${JSON.stringify(activity.data.object)}`);
            }
            break;

        case 'Reject':
            this.logger.log(`Handling 'Reject' activity from '${actorActivityPubId}' for object: '${objectActivityPubId}'.`);
            if (activity.data.object && typeof activity.data.object === 'object' && activity.data.object.type) {
                const rejectedObjectType = activity.data.object.type;
                const rejectedObjectActor = String(activity.data.object.actor);
                const rejectedObjectTarget = activity.data.object.object ? String(activity.data.object.object) : undefined;

                switch (rejectedObjectType) {
                    case 'Follow':
                        this.logger.log(`Received Reject for Follow from '${rejectedObjectActor}' to '${rejectedObjectTarget}'. This means our follow request was denied.`);
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
                          this.logger.log(`Updated Follow relationship status to 'rejected' for: '${rejectedObjectTarget}' -> '${rejectedObjectActor}'.`);
                        } else {
                          this.logger.warn(`Could not find pending Follow relationship to reject for: '${rejectedObjectTarget}' -> '${rejectedObjectActor}'. It might already be rejected or not exist.`);
                        }
                        break;
                    case 'Announce':
                        this.logger.log(`Received Reject for Announce from '${rejectedObjectActor}' for object '${rejectedObjectTarget}'.`);
                        break;
                    case 'Like':
                        this.logger.log(`Received Reject for Like from '${rejectedObjectActor}' for object '${rejectedObjectTarget}'.`);
                        break;
                    default:
                        this.logger.log(`Reject activity from '${actorActivityPubId}' for unhandled object type: '${rejectedObjectType}'. Skipping specific processing.`);
                        break;
                }
            } else {
                this.logger.warn(`Malformed Reject activity received from '${actorActivityPubId}': missing object or object type. Skipping processing. Activity object: ${JSON.stringify(activity.data.object)}`);
            }
            break;

        case 'Undo':
          this.logger.log(`Handling 'Undo' activity from '${actorActivityPubId}'.`);
          if (activity.data.object && typeof activity.data.object === 'object') {
            const undoObjectType = activity.data.object.type;
            const undoObjectActor = String(activity.data.object.actor);
            const undoObjectTarget = activity.data.object.object ? String(activity.data.object.object) : undefined;

            switch (undoObjectType) {
                case 'Follow':
                    this.logger.log(`Processing Undo Follow: '${undoObjectActor}' unfollowing '${undoObjectTarget}'.`);
                    // When an Undo Follow is received, it means the remote actor is no longer following our local actor.
                    // We need to delete the follow relationship where the remote actor is the follower and our local actor is the followed.
                    const resultFollow = await this.followRepository.delete({
                        followerActivityPubId: undoObjectActor, // The remote actor who is unfollowing
                        followedActivityPubId: undoObjectTarget, // Our local actor who was followed
                    });
                    if (resultFollow.affected && resultFollow.affected > 0) {
                        this.logger.log(`Removed Follow relationship: '${undoObjectActor}' is no longer following '${undoObjectTarget}'.`);
                    } else {
                        this.logger.log(`Attempted to Undo Follow, but relationship not found: '${undoObjectActor}' -> '${undoObjectTarget}'. No action taken.`);
                    }
                    break;
                case 'Like':
                    this.logger.log(`Processing Undo Like: '${undoObjectActor}' unliking '${undoObjectTarget}'.`);
                    const resultLike = await this.likeRepository.delete({
                        likerActivityPubId: undoObjectActor,
                        likedObjectActivityPubId: undoObjectTarget,
                    });
                    if (resultLike.affected && resultLike.affected > 0) {
                        this.logger.log(`Removed Like relationship: '${undoObjectActor}' no longer likes '${undoObjectTarget}'.`);
                    } else {
                        this.logger.log(`Attempted to Undo Like, but relationship not found: '${undoObjectActor}' liked '${undoObjectTarget}'. No action taken.`);
                    }
                    break;
                case 'Announce':
                    this.logger.log(`Processing Undo Announce from '${undoObjectActor}' for object: '${undoObjectTarget}'.`);
                    const resultAnnounce = await this.activityRepository.delete({
                        type: 'Announce',
                        actorActivityPubId: undoObjectActor,
                        objectActivityPubId: undoObjectTarget,
                    });
                    if (resultAnnounce.affected && resultAnnounce.affected > 0) {
                        this.logger.log(`Removed Announce activity: '${undoObjectActor}' no longer announces '${undoObjectTarget}'.`);
                    } else {
                        this.logger.log(`Attempted to Undo Announce, but activity not found: '${undoObjectActor}' announced '${undoObjectTarget}'. No action taken.`);
                    }
                    break;
                case 'Block':
                    this.logger.log(`Processing Undo Block: '${undoObjectActor}' unblocking '${undoObjectTarget}'.`);
                    const resultBlock = await this.blockRepository.delete({
                        blockerActivityPubId: undoObjectActor,
                        blockedActivityPubId: undoObjectTarget,
                    });
                    if (resultBlock.affected && resultBlock.affected > 0) {
                        this.logger.log(`Removed Block relationship: '${undoObjectActor}' no longer blocks '${undoObjectTarget}'.`);
                    } else {
                        this.logger.log(`Attempted to Undo Block, but relationship not found: '${undoObjectActor}' blocked '${undoObjectTarget}'. No action taken.`);
                    }
                    break;
                case 'Create':
                    this.logger.log(`Processing Undo Create (effectively Delete) for object: '${undoObjectTarget}'.`);
                    if (undoObjectTarget) {
                        const localContentObject = await this.contentObjectRepository.findOne({ where: { activityPubId: undoObjectTarget } });
                        if (localContentObject) {
                            await this.contentObjectRepository.softDelete(localContentObject.id);
                            this.logger.log(`Soft-deleted local content object (ID: '${undoObjectTarget}') due to Undo Create activity from '${actorActivityPubId}'.`);
                        } else {
                            this.logger.log(`Received Undo Create for non-local or non-existent object: '${undoObjectTarget}'. No local action taken.`);
                        }
                    } else {
                      this.logger.warn(`Undo Create activity from '${actorActivityPubId}' missing target object ID. Skipping processing.`);
                    }
                    break;
                default:
                    this.logger.log(`Undo activity from '${actorActivityPubId}' with unhandled object type: '${undoObjectType}'. Skipping processing.`);
                    break;
            }
          } else {
            this.logger.warn(`Malformed Undo activity received from '${actorActivityPubId}': missing object or object type. Skipping processing. Activity object: ${JSON.stringify(activity.data.object)}`);
          }
          break;

        default:
          this.logger.log(`Unhandled activity type: '${activityType}' from actor '${actorActivityPubId}'. Activity data: ${JSON.stringify(activity.data)}. Skipping processing.`);
          break;
      }
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate some work/delay for demonstration purposes
      this.logger.log(`Successfully completed processing for activity '${activity.activityPubId}'.`);
    } catch (error) {
      this.logger.error(`Error processing activity '${activity.activityPubId}' of type '${activityType}' from '${actorActivityPubId}': ${error.message}.`, error.stack);
      // Re-throw the error to ensure BullMQ marks the job as failed and handles retries.
      // This is crucial for reliable message processing.
      throw error;
    }
  }

  // BullMQ Worker Event Handlers: Provide visibility into job lifecycle
  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`BullMQ Job '${job.id}' of type '${job.name}' completed successfully.`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`BullMQ Job '${job.id}' of type '${job.name}' failed with error: ${err.message}. Attempts made: ${job.attemptsMade}.`, err.stack);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.debug(`BullMQ Job '${job.id}' of type '${job.name}' is now active.`);
  }
}
