// src/core/services/app.service.ts

import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorEntity } from 'src/features/activitypub/entities/actor.entity';
import { UserEntity } from 'src/features/auth/entities/user.entity';
import { ActivityEntity } from 'src/features/activitypub/entities/activity.entity';
import { FollowEntity } from 'src/features/activitypub/entities/follow.entity';
import { ContentObjectEntity } from 'src/features/activitypub/entities/content-object.entity';
import { LikeEntity } from 'src/features/activitypub/entities/like.entity';
import { LoggerService } from 'src/shared/services/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ProcessedActivityEntity } from 'src/features/activitypub/entities/processed-activity.entity';
import { normalizeUrl } from 'src/shared/utils/url-normalizer';
import { RemoteObjectService } from './remote-object.service';
import { FlashcardEntity } from 'src/features/educationpub/entities/flashcard.entity';
import { FlashcardModelEntity } from 'src/features/educationpub/entities/flashcard-model.entity';

/**
 * AppService
 *
 * This service acts as a central orchestrator for various application
 * functionalities, particularly those involving interactions between different
 * modules and external ActivityPub instances. It handles core logic for:
 * - ActivityPub actor profile retrieval.
 * - Processing incoming (inbox) and outgoing (outbox) ActivityPub activities.
 * - Managing ActivityPub collections (followers, following, liked, outbox, inbox, public).
 * - Delegating activity processing to appropriate handlers.
 * - Coordinating with queueing mechanisms (BullMQ) for asynchronous tasks.
 */
@Injectable()
export class AppService {
  private readonly instanceBaseUrl: string;

  constructor(
    @InjectRepository(ActorEntity)
    private readonly actorRepository: Repository<ActorEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: Repository<ActivityEntity>,
    @InjectRepository(FollowEntity)
    private readonly followRepository: Repository<FollowEntity>,
    @InjectRepository(ContentObjectEntity)
    private readonly contentObjectRepository: Repository<ContentObjectEntity>,
    @InjectRepository(LikeEntity)
    private readonly likeRepository: Repository<LikeEntity>,
    @InjectRepository(ProcessedActivityEntity)
    private readonly processedActivityRepository: Repository<ProcessedActivityEntity>,
    @InjectRepository(FlashcardEntity)
    private readonly flashcardRepository: Repository<FlashcardEntity>, // Inject FlashcardEntity
    @InjectRepository(FlashcardModelEntity)
    private readonly flashcardModelRepository: Repository<FlashcardModelEntity>, // Inject FlashcardModelEntity
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    @InjectQueue('inbox') private inboxQueue: Queue,
    @InjectQueue('outbox') private outboxQueue: Queue,
    private readonly remoteObjectService: RemoteObjectService,
  ) {
    this.logger.setContext('AppService');
    const baseUrl = this.configService.get<string>('INSTANCE_BASE_URL');
    if (!baseUrl) {
      this.logger.error('INSTANCE_BASE_URL is not defined in environment variables.');
      throw new Error('INSTANCE_BASE_URL is not defined.');
    }
    this.instanceBaseUrl = baseUrl;
  }

  /**
   * Returns the base URL of the current ActivityPub instance.
   */
  getInstanceBaseUrl(): string {
    return this.instanceBaseUrl;
  }

  /**
   * Retrieves an actor's profile data.
   *
   * @param username The preferred username of the actor.
   * @returns The actor entity.
   */
  async getActorProfile(username: string): Promise<ActorEntity> {
    this.logger.debug(`Fetching actor profile for username: ${username}`);
    const actor = await this.actorRepository.findOne({ where: { preferredUsername: username } });
    if (!actor) {
      throw new NotFoundException(`Actor with username '${username}' not found.`);
    }
    return actor;
  }

  /**
   * Handles incoming ActivityPub POST requests to an actor's inbox.
   * Enqueues the activity for asynchronous processing.
   *
   * @param username The username of the local actor whose inbox received the activity.
   * @param activity The incoming ActivityPub activity payload.
   */
  async handleInboxPost(username: string, activity: any): Promise<void> {
    this.logger.log(`Received inbox activity for ${username}: ${JSON.stringify(activity.type)}`);

    const localActor = await this.actorRepository.findOne({ where: { preferredUsername: username, isLocal: true } });
    if (!localActor) {
      this.logger.warn(`Inbox post received for non-existent local actor: ${username}`);
      throw new NotFoundException(`Actor ${username} not found on this instance.`);
    }

    const activityId = activity.id;
    if (!activityId) {
      this.logger.warn(`Received inbox activity for ${username} without an 'id'. Skipping deduplication.`);
    } else {
      // Check for deduplication
      const existingProcessedActivity = await this.processedActivityRepository.findOne({ where: { activityId: normalizeUrl(activityId) } });
      if (existingProcessedActivity) {
        this.logger.log(`Activity '${activityId}' already processed. Skipping.`);
        return; // Activity already processed, return early.
      }
    }

    // Enqueue the activity for asynchronous processing by the InboxProcessor
    try {
      await this.inboxQueue.add(
        'process-inbox-activity',
        {
          localActorId: localActor.id,
          activity: activity,
          activityId: activityId, // Pass normalized Activity ID for deduplication
        },
        {
          jobId: activityId ? normalizeUrl(activityId) : undefined, // Use normalized Activity ID as jobId for deduplication in BullMQ
          attempts: 3, // Retry failed jobs
          backoff: { type: 'exponential', delay: 1000 }, // Exponential backoff for retries
        }
      );
      this.logger.log(`Inbox activity for ${username} enqueued. Job ID: ${activityId}`);

      // Record as processed *after* successful enqueue
      if (activityId) {
        const processed = this.processedActivityRepository.create({ activityId: normalizeUrl(activityId) });
        await this.processedActivityRepository.save(processed);
      }

    } catch (error) {
      this.logger.error(`Failed to enqueue inbox activity for ${username}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to process inbox activity.');
    }
  }

  /**
   * Handles outgoing ActivityPub POST requests from a local actor's outbox.
   * Enqueues the activity for asynchronous dispatch.
   *
   * @param username The username of the local actor whose outbox is sending the activity.
   * @param activity The outgoing ActivityPub activity payload.
   * @param localActorId The internal database ID of the local actor.
   */
  async handleOutboxPost(username: string, activity: any, localActorId: string): Promise<void> {
    this.logger.log(`Received outbox activity for ${username}: ${JSON.stringify(activity.type)}`);

    const localActor = await this.actorRepository.findOne({ where: { id: localActorId, isLocal: true } });
    if (!localActor || localActor.preferredUsername !== username) {
      this.logger.warn(`Outbox post received for unauthorized local actor: ${username}, authenticated as ${localActorId}`);
      throw new NotFoundException(`Actor ${username} not found or unauthorized.`);
    }

    // Create a new ActivityEntity to store the outgoing activity locally
    const newActivity = this.activityRepository.create({
      activityPubId: activity.id,
      type: activity.type,
      actorActivityPubId: activity.actor,
      objectActivityPubId: activity.object?.id || activity.object, // Can be object or string URI
      data: activity,
      actor: localActor,
    });

    try {
      const savedActivity = await this.activityRepository.save(newActivity);
      // Enqueue the activity for asynchronous dispatch by the OutboxProcessor
      await this.outboxQueue.add(
        'deliver-activity',
        {
          activityId: savedActivity.id, // Internal ID
          activity: savedActivity.data, // Full payload
          actorId: localActor.id, // Internal Actor ID for signing
        },
        {
          jobId: savedActivity.activityPubId, // Use ActivityPub ID as jobId for idempotency
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        }
      );
      this.logger.log(`Outbox activity for ${username} enqueued for dispatch. Job ID: ${savedActivity.activityPubId}`);
    } catch (error) {
      this.logger.error(`Failed to enqueue outbox activity for ${username}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to process outbox activity.');
    }
  }

  /**
   * Handles incoming ActivityPub POST requests to the relay inbox.
   * Enqueues the activity for asynchronous processing.
   * This is typically for public activities not directly addressed to a specific local actor.
   *
   * @param activity The incoming ActivityPub activity payload.
   * @param req The Express Request object, used to pass rawBody for digest verification.
   */
  async handleRelayPost(activity: any, req: any): Promise<void> {
    this.logger.log(`Received relay activity: ${JSON.stringify(activity.type)}`);

    const activityId = activity.id;
    if (!activityId) {
      this.logger.warn(`Received relay activity without an 'id'. Skipping deduplication.`);
    } else {
      // Check for deduplication
      const existingProcessedActivity = await this.processedActivityRepository.findOne({ where: { activityId: normalizeUrl(activityId) } });
      if (existingProcessedActivity) {
        this.logger.log(`Activity '${activityId}' already processed (relay). Skipping.`);
        return;
      }
    }

    // Enqueue the activity for asynchronous processing by the InboxProcessor
    try {
      await this.inboxQueue.add(
        'process-inbox-activity',
        {
          // No localActorId for relay posts, as they are not specifically addressed to one.
          // The processor will determine relevant local actors or store public content.
          activity: activity,
          activityId: activityId,
        },
        {
          jobId: activityId ? normalizeUrl(activityId) : undefined, // Use normalized Activity ID as jobId
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        }
      );
      this.logger.log(`Relay activity enqueued. Job ID: ${activityId}`);

      // Record as processed *after* successful enqueue
      if (activityId) {
        const processed = this.processedActivityRepository.create({ activityId: normalizeUrl(activityId) });
        await this.processedActivityRepository.save(processed);
      }
    } catch (error) {
      this.logger.error(`Failed to enqueue relay activity: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to process relay activity.');
    }
  }


  /**
   * Retrieves the followers collection for a given actor.
   *
   * @param username The preferred username of the actor.
   * @param page The page number for pagination.
   * @param perPage The number of items per page.
   * @returns An ActivityStreams OrderedCollection object.
   */
  async getFollowersCollection(username: string, page: number, perPage: number): Promise<any> {
    this.logger.debug(`Fetching followers collection for ${username}, page ${page}, perPage ${perPage}`);
    const localActor = await this.actorRepository.findOne({ where: { preferredUsername: username } });
    if (!localActor) {
      throw new NotFoundException(`Actor ${username} not found.`);
    }

    const [followers, totalItems] = await this.followRepository.findAndCount({
      where: { followedActivityPubId: localActor.activityPubId, status: 'accepted' },
      skip: (page - 1) * perPage,
      take: perPage,
      relations: ['follower'], // Include follower actor details
    });

    const items = followers.map(follow => follow.followerActivityPubId); // Return ActivityPub IDs of followers

    return {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: localActor.followersUrl,
      type: "OrderedCollection",
      totalItems: totalItems,
      // You can add 'first', 'last', 'next', 'prev' links here for full pagination support
      orderedItems: items,
    };
  }

  /**
   * Retrieves the following collection for a given actor.
   *
   * @param username The preferred username of the actor.
   * @param page The page number for pagination.
   * @param perPage The number of items per page.
   * @returns An ActivityStreams OrderedCollection object.
   */
  async getFollowingCollection(username: string, page: number, perPage: number): Promise<any> {
    this.logger.debug(`Fetching following collection for ${username}, page ${page}, perPage ${perPage}`);
    const localActor = await this.actorRepository.findOne({ where: { preferredUsername: username } });
    if (!localActor) {
      throw new NotFoundException(`Actor ${username} not found.`);
    }

    const [following, totalItems] = await this.followRepository.findAndCount({
      where: { followerActivityPubId: localActor.activityPubId, status: 'accepted' },
      skip: (page - 1) * perPage,
      take: perPage,
      relations: ['following'], // Include following actor details
    });

    const items = following.map(follow => follow.followedActivityPubId); // Return ActivityPub IDs of who this actor is following

    return {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: localActor.followingUrl,
      type: "OrderedCollection",
      totalItems: totalItems,
      orderedItems: items,
    };
  }

  /**
   * Retrieves the outbox collection for a given actor.
   *
   * @param username The preferred username of the actor.
   * @param page The page number for pagination.
   * @param perPage The number of items per page.
   * @returns An ActivityStreams OrderedCollection object.
   */
  async getOutboxCollection(username: string, page: number, perPage: number): Promise<any> {
    this.logger.debug(`Fetching outbox collection for ${username}, page ${page}, perPage ${perPage}`);
    const localActor = await this.actorRepository.findOne({ where: { preferredUsername: username, isLocal: true } });
    if (!localActor) {
      // For outbox, we only expose local actors' outboxes via this endpoint.
      throw new NotFoundException(`Local actor ${username} not found.`);
    }

    const [activities, totalItems] = await this.activityRepository.findAndCount({
      where: { actorActivityPubId: localActor.activityPubId },
      order: { createdAt: 'DESC' }, // Order by creation date descending
      skip: (page - 1) * perPage,
      take: perPage,
    });

    // Return the full activity data (JSON-LD payload) for each activity
    const items = activities.map(activity => activity.data);

    return {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: localActor.outbox,
      type: "OrderedCollection",
      totalItems: totalItems,
      orderedItems: items,
    };
  }

  /**
   * Retrieves the inbox collection for a given actor.
   * This endpoint should ideally be protected and only accessible to the actor themselves.
   *
   * @param username The preferred username of the actor.
   * @param page The page number for pagination.
   * @param perPage The number of items per page.
   * @returns An ActivityStreams OrderedCollection object.
   */
  async getInboxCollection(username: string, page: number, perPage: number): Promise<any> {
    this.logger.debug(`Fetching inbox collection for ${username}, page ${page}, perPage ${perPage}`);
    const localActor = await this.actorRepository.findOne({ where: { preferredUsername: username, isLocal: true } });
    if (!localActor) {
      throw new NotFoundException(`Local actor ${username} not found.`);
    }

    // Note: The 'to' or 'audience' fields of incoming activities are usually used to determine if they belong in an inbox.
    // For simplicity here, we might just query activities where this actor is the actor or the object.
    // A more robust implementation would filter based on 'to', 'cc', 'bto', 'bcc', 'audience' fields within the activity.data
    // For MVP, assuming relevant activities are stored and can be filtered or are explicitly linked.
    // This example fetches activities that have the local actor as the object's attributedTo or are direct responses.
    const [activities, totalItems] = await this.activityRepository
      .createQueryBuilder('activity')
      .leftJoinAndSelect('activity.actor', 'actor') // Join to get actor details if needed
      .where('activity.actorActivityPubId = :actorId OR activity.objectActivityPubId = :actorId', { actorId: localActor.activityPubId })
      .orderBy('activity.createdAt', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage)
      .getManyAndCount();

    const items = activities.map(activity => activity.data);

    return {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: localActor.inbox,
      type: "OrderedCollection",
      totalItems: totalItems,
      orderedItems: items,
    };
  }

  /**
   * Retrieves the liked collection for a given actor.
   *
   * @param username The preferred username of the actor.
   * @param page The page number for pagination.
   * @param perPage The number of items per page.
   * @returns An ActivityStreams OrderedCollection object.
   */
  async getLikedCollection(username: string, page: number, perPage: number): Promise<any> {
    this.logger.debug(`Fetching liked collection for ${username}, page ${page}, perPage ${perPage}`);
    const localActor = await this.actorRepository.findOne({ where: { preferredUsername: username } });
    if (!localActor) {
      throw new NotFoundException(`Actor ${username} not found.`);
    }

    const [likes, totalItems] = await this.likeRepository.findAndCount({
      where: { likerActivityPubId: localActor.activityPubId },
      skip: (page - 1) * perPage,
      take: perPage,
      relations: ['likedObject'], // Optionally load the actual liked object details
    });

    const items = likes.map(like => like.likedObjectActivityPubId); // Return ActivityPub IDs of liked objects

    return {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: localActor.likedUrl, // Use the liked collection URL
      type: "OrderedCollection",
      totalItems: totalItems,
      orderedItems: items,
    };
  }

  /**
   * Retrieves a specific ActivityPub activity object by its full ActivityPub ID.
   * This is used for dereferencing objects via their URIs (e.g., from an 'object' field in an activity).
   *
   * @param activityPubId The full ActivityPub URI of the activity.
   * @returns The ActivityEntity data payload.
   */
  async getActivityObject(activityPubId: string): Promise<any> {
    this.logger.debug(`Fetching activity object by ActivityPub ID: ${activityPubId}`);
    const normalizedId = normalizeUrl(activityPubId);
    const activity = await this.activityRepository.findOne({ where: { activityPubId: normalizedId } });
    if (!activity) {
      throw new NotFoundException(`Activity with ID '${activityPubId}' not found.`);
    }
    return activity.data; // Return the stored JSON-LD payload
  }

  /**
   * Retrieves a specific local content object (e.g., a Note, an Image, a Flashcard)
   * by its ActivityPub ID. This is typically used when other instances try to
   * dereference content objects hosted on this instance.
   *
   * @param activityPubId The full ActivityPub URI of the content object.
   * @returns The content object's data payload.
   */
  async getLocalContentObject(activityPubId: string): Promise<any> {
    this.logger.debug(`Fetching local content object by ActivityPub ID: ${activityPubId}`);
    const normalizedId = normalizeUrl(activityPubId);

    // Try to find in generic ContentObjectEntity
    let contentObject = await this.contentObjectRepository.findOne({ where: { activityPubId: normalizedId } });
    if (contentObject) {
      return contentObject.data;
    }

    // If not found as generic content, check specific edu:Flashcard entity
    const flashcard = await this.flashcardRepository.findOne({ where: { activityPubId: normalizedId } });
    if (flashcard) {
      // Reconstruct ActivityPub JSON-LD for the flashcard
      const actor = await this.actorRepository.findOne({ where: { activityPubId: flashcard.attributedToActivityPubId } });
      const flashcardModel = flashcard.eduModel || await this.remoteObjectService.fetchRemoteObject(flashcard.modelId); // Fetch model if not loaded

      const flashcardContent =
        `Flashcard: ${flashcard.name}\n\n` +
        Object.entries(flashcard.eduFieldsData)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n');

      return {
        '@context': [
          'https://www.w3.org/ns/activitystreams',
          'https://social.bleauweb.org/ns/education-pub',
          'https://w3id.org/security/v1',
        ],
        id: flashcard.activityPubId,
        type: ['edu:Flashcard', 'Note'], // Flashcard can also be a Note
        attributedTo: flashcard.attributedToActivityPubId,
        published: flashcard.createdAt.toISOString(),
        updated: flashcard.updatedAt.toISOString(), // Use updatedAt for Last-Modified header
        content: flashcardContent,
        name: flashcard.name,
        'edu:model': flashcardModel?.activityPubId || flashcard.modelId,
        'edu:fieldsData': flashcard.eduFieldsData,
        ...(flashcard.eduTags && { 'edu:tags': flashcard.eduTags }),
        ...(flashcard.eduTargetLanguage && { 'edu:targetLanguage': flashcard.eduTargetLanguage }),
        ...(flashcard.eduSourceLanguage && { 'edu:sourceLanguage': flashcard.eduSourceLanguage }),
      };
    }

    // If not found as Flashcard, check FlashcardModel
    const flashcardModel = await this.flashcardModelRepository.findOne({ where: { activityPubId: normalizedId } });
    if (flashcardModel) {
      return {
        '@context': [
          'https://www.w3.org/ns/activitystreams',
          'https://social.bleauweb.org/ns/education-pub',
          'https://w3id.org/security/v1',
        ],
        id: flashcardModel.activityPubId,
        type: ['edu:FlashcardModel', 'Object'], // Custom type for models
        name: flashcardModel.name,
        summary: flashcardModel.summary,
        'edu:fields': flashcardModel.eduFields,
        'edu:cardTemplates': flashcardModel.eduCardTemplates,
        'edu:stylingCSS': flashcardModel.eduStylingCSS,
        published: flashcardModel.createdAt.toISOString(),
        updated: flashcardModel.updatedAt.toISOString(),
      };
    }

    throw new NotFoundException(`Content object with ID '${activityPubId}' not found.`);
  }

  /**
   * Retrieves a public timeline of activities.
   * This typically includes public posts, announces, etc.
   *
   * @param page The page number for pagination.
   * @param perPage The number of items per page.
   * @returns An ActivityStreams OrderedCollection object.
   */
  async getPublicTimeline(page: number, perPage: number): Promise<any> {
    this.logger.debug(`Fetching public timeline, page ${page}, perPage ${perPage}`);

    // This is a simplified public timeline. A real one might aggregate
    // activities marked 'to: as:Public' or 'to: <instance_public_url>'.
    // For MVP, we fetch all activities that were intended for public consumption
    // which were stored. This might involve filtering by certain activity types or recipients.
    const [activities, totalItems] = await this.activityRepository
      .createQueryBuilder('activity')
      .where("activity.data @> '{\"to\": [\"https://www.w3.org/ns/activitystreams#Public\"]}'")
      .orWhere("activity.data @> '{\"cc\": [\"https://www.w3.org/ns/activitystreams#Public\"]}'")
      .orderBy('activity.createdAt', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage)
      .getManyAndCount();

    const items = activities.map(activity => activity.data);

    return {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: `${this.instanceBaseUrl}/public`, // Example public timeline ID
      type: "OrderedCollection",
      totalItems: totalItems,
      orderedItems: items,
    };
  }

  /**
   * Retrieves NodeInfo 2.0 metadata about this instance.
   *
   * @returns An object conforming to the NodeInfo 2.0 schema.
   */
  async getNodeInfo2(): Promise<any> {
    this.logger.debug('Fetching NodeInfo 2.0 metadata.');

    // Count local users and posts (adjust queries based on your actual data models)
    const totalLocalUsers = await this.userRepository.count();
    const totalLocalPosts = await this.flashcardRepository.count({ where: { isPublic: true } }); // Assuming public flashcards are 'posts'

    return {
      version: "2.0",
      software: {
        name: "edupub",
        version: "0.1.0-alpha", // Placeholder, ideally from package.json or build process
        repository: "https://github.com/your-org/edupub", // Placeholder
        homepage: this.instanceBaseUrl,
      },
      protocols: [
        "activitypub"
      ],
      services: {
        outbound: [], // e.g., "atom", "gnusocial", "linkedin", "pumpio", "twitter"
        inbound: []   // e.g., "atom", "gnusocial", "linkedin", "pumpio", "twitter"
      },
      openRegistrations: false, // Whether new users can register freely (true/false)
      usage: {
        users: {
          total: totalLocalUsers,
          activeMonth: 0, // Implement logic to count active users in the last month
          activeHalfyear: 0, // Implement logic to count active users in the last 6 months
        },
        localPosts: totalLocalPosts, // Total public content objects (e.g., notes, flashcards)
        localComments: 0, // Implement if you have distinct comment entities
      },
      // Optional: Add metadata about the instance
      metadata: {
        nodeName: "EduPub Instance",
        nodeDescription: "A federated flashcard and social study platform.",
        // You can add more custom metadata here.
      },
    };
  }
}
