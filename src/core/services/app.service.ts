// src/core/services/app.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config'; // FIX: Corrected import syntax
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { ActorEntity } from 'src/features/activitypub/entities/actor.entity';
import { ActivityEntity } from 'src/features/activitypub/entities/activity.entity';
import { FollowEntity } from 'src/features/activitypub/entities/follow.entity';
import { ContentObjectEntity } from 'src/features/activitypub/entities/content-object.entity';
import { LikeEntity } from 'src/features/activitypub/entities/like.entity';
import { LoggerService } from 'src/shared/services/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RemoteObjectService } from './remote-object.service';
import { FlashcardEntity } from 'src/features/educationpub/entities/flashcard.entity';
import { FlashcardModelEntity } from 'src/features/educationpub/entities/flashcard-model.entity';
import { URL } from 'url';
import { randomUUID } from 'crypto';
import { ActorService } from 'src/features/activitypub/services/actor.service';
import { normalizeUrl } from 'src/shared/utils/url-normalizer';
import { Request } from 'express';
import { UserEntity } from 'src/features/auth/entities/user.entity';

/**
 * AppService
 *
 * This service acts as a central orchestrator for various application-level
 * operations, particularly those involving cross-module interactions or
 * complex business logic that doesn't fit neatly into a single feature module.
 * It handles ActivityPub federation concerns, content retrieval, and instance information.
 */
@Injectable()
export class AppService {
  private readonly instanceBaseUrl: string;
  private readonly instanceDomain: string;

  constructor(
    @InjectRepository(ActorEntity)
    private actorRepository: Repository<ActorEntity>,
    @InjectRepository(ActivityEntity)
    private activityRepository: Repository<ActivityEntity>,
    @InjectRepository(FollowEntity)
    private followRepository: Repository<FollowEntity>,
    @InjectRepository(ContentObjectEntity)
    private contentObjectRepository: Repository<ContentObjectEntity>,
    @InjectRepository(LikeEntity)
    private likeRepository: Repository<LikeEntity>,
    @InjectRepository(FlashcardEntity)
    private flashcardRepository: Repository<FlashcardEntity>,
    @InjectRepository(FlashcardModelEntity)
    private readonly flashcardModelRepository: Repository<FlashcardModelEntity>,
    @InjectQueue('inbox') private inboxQueue: Queue,
    @InjectQueue('outbox') private outboxQueue: Queue,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly remoteObjectService: RemoteObjectService,
    private readonly actorService: ActorService,
  ) {
    this.logger.setContext('AppService');
    const baseUrl = this.configService.get<string>('INSTANCE_BASE_URL');
    if (!baseUrl) {
      this.logger.error('INSTANCE_BASE_URL is not defined in environment variables.');
      throw new Error('INSTANCE_BASE_URL is not defined.');
    }
    this.instanceBaseUrl = baseUrl;
    this.instanceDomain = new URL(this.instanceBaseUrl).hostname;
  }

  getInstanceBaseUrl(): string {
    return this.instanceBaseUrl;
  }

  /**
   * Retrieves the WebFinger JRD (JSON Resource Descriptor) for a given username.
   * This is used for actor discovery by other Fediverse instances.
   * @param username The preferred username (e.g., 'alice').
   * @returns The JRD object.
   */
  async getWebfingerJrd(username: string): Promise<any> {
    this.logger.log(`Generating WebFinger JRD for username: ${username}`);
    const actor = await this.actorService.findActorByPreferredUsername(username);
    if (!actor) {
      this.logger.warn(`WebFinger: Actor '${username}' not found.`);
      return null;
    }

    return {
      subject: `acct:${username}@${this.instanceDomain}`,
      aliases: [actor.activityPubId],
      links: [
        {
          rel: 'self',
          type: 'application/activity+json',
          href: actor.activityPubId,
        },
        // Potentially add other links like profile page, etc.
      ],
    };
  }

  /**
   * Retrieves an ActivityPub compliant actor profile for a given username.
   * This constructs the JSON-LD representation of the actor.
   * @param username The preferred username of the actor.
   * @returns The actor's profile data, including their public key.
   */
  async getActorProfile(username: string): Promise<{ data: object }> {
    this.logger.log(`Fetching actor profile for username: ${username}`);
    const actor = await this.actorService.findActorByPreferredUsername(username);
    if (!actor) {
      this.logger.warn(`Actor profile: Actor '${username}' not found.`);
      throw new NotFoundException(`Actor with username '${username}' not found.`);
    }

    // Construct the ActivityPub 'as:Person' object
    const actorProfile: any = {
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        'https://w3id.org/security/v1', // For public key
        // Add Mastodon and Schema.org specific contexts as seen in curl output for richer compatibility
        {
          "manuallyApprovesFollowers": "as:manuallyApprovesFollowers",
          "toot": "http://joinmastodon.org/ns#",
          "featured": { "@id": "toot:featured", "@type": "@id" },
          "featuredTags": { "@id": "toot:featuredTags", "@type": "@id" },
          "alsoKnownAs": { "@id": "as:alsoKnownAs", "@type": "@id" },
          "movedTo": { "@id": "as:movedTo", "@type": "@id" },
          "schema": "http://schema.org#",
          "PropertyValue": "schema:PropertyValue",
          "value": "schema:value",
          "discoverable": "toot:discoverable",
          "suspended": "toot:suspended",
          "memorial": "toot:memorial",
          "indexable": "toot:indexable",
          "attributionDomains": { "@id": "toot:attributionDomains", "@type": "@id" },
          "focalPoint": { "@container": "@list", "@id": "toot:focalPoint" }
        },
        // EduPub specific context (ensure this URL is accessible and defines edu: vocabulary)
        'https://edupub.social/ns/educationpub',
      ],
      id: actor.activityPubId,
      type: 'Person', // Or 'Application', etc. based on actor type
      preferredUsername: actor.preferredUsername,
      name: actor.name || actor.preferredUsername,
      summary: actor.summary,
      inbox: actor.inbox,
      outbox: actor.outbox,
      followers: actor.followersUrl, // Link to followers collection
      following: actor.followingUrl, // Link to following collection
      liked: actor.likedUrl, // Link to liked collection
      published: actor.createdAt ? actor.createdAt.toISOString() : undefined, // Add published timestamp
      url: actor.data?.['url'] || actor.activityPubId, // Use 'url' from data if available, otherwise activityPubId
      
      // Public key for HTTP Signatures
      publicKey: {
        id: `${actor.activityPubId}#main-key`, // Unique ID for the public key
        owner: actor.activityPubId, // Owner of the public key
        publicKeyPem: actor.publicKeyPem, // The PEM-encoded public key
      },
      
      // Add other ActivityPub properties from actor.data if they exist
      ...(actor.data?.['icon'] && { icon: actor.data['icon'] }),
      ...(actor.data?.['image'] && { image: actor.data['image'] }),
      ...(actor.data?.['alsoKnownAs'] && { alsoKnownAs: actor.data['alsoKnownAs'] }),
      ...(actor.data?.['tag'] && { tag: actor.data['tag'] }),
      ...(actor.data?.['attachment'] && { attachment: actor.data['attachment'] }),
      ...(actor.data?.['endpoints'] && { endpoints: actor.data['endpoints'] }), // Merge or override endpoints
      // Add Mastodon specific properties if relevant for local actors
      ...(actor.data?.['manuallyApprovesFollowers'] !== undefined && { manuallyApprovesFollowers: actor.data['manuallyApprovesFollowers'] }),
      ...(actor.data?.['discoverable'] !== undefined && { discoverable: actor.data['discoverable'] }),
      ...(actor.data?.['indexable'] !== undefined && { indexable: actor.data['indexable'] }),
      ...(actor.data?.['suspended'] !== undefined && { suspended: actor.data['suspended'] }),
      ...(actor.data?.['memorial'] !== undefined && { memorial: actor.data['memorial'] }),
      ...(actor.data?.['featured'] !== undefined && { featured: actor.data['featured'] }),
      ...(actor.data?.['featuredTags'] !== undefined && { featuredTags: actor.data['featuredTags'] }),
      ...(actor.data?.['attributionDomains'] !== undefined && { attributionDomains: actor.data['attributionDomains'] }),
      ...(actor.data?.['focalPoint'] !== undefined && { focalPoint: actor.data['focalPoint'] }),
    };

    // Ensure endpoints are correctly merged if they exist in actor.data
    if (actor.data?.['endpoints'] && typeof actor.data['endpoints'] === 'object') {
        Object.assign(actorProfile.endpoints, actor.data['endpoints']);
    }

    return { data: actorProfile };
  }

  /**
   * Handles an incoming ActivityPub POST request to an actor's inbox.
   * Enqueues the activity for asynchronous processing.
   * @param username The username of the local actor whose inbox received the activity.
   * @param activity The raw ActivityPub JSON-LD payload.
   */
  async handleInboxPost(username: string, activity: any): Promise<void> {
    this.logger.log(`Enqueueing inbox activity for user '${username}'.`);

    const localActor = await this.actorService.findActorByPreferredUsername(username);
    if (!localActor) {
      this.logger.warn(`Inbox: Local actor '${username}' not found for incoming activity.`);
      throw new NotFoundException(`Local actor '${username}' not found.`);
    }

    // Attempt to extract ActivityPub ID and Actor ID from the incoming activity
    const activityPubId = normalizeUrl(activity.id || `${this.instanceBaseUrl}/activities/${randomUUID()}`); // Generate if missing, but usually present
    
    // RESOLVE: Check both 'actor' and 'as:actor' due to JSON-LD aliasing
    let incomingActor: string | object | undefined = activity.actor || activity['as:actor'];
    let actorActivityPubId: string;

    if (typeof incomingActor === 'string') {
        actorActivityPubId = normalizeUrl(incomingActor);
    } else if (typeof incomingActor === 'object' && incomingActor !== null && (<any>incomingActor).id) {
        actorActivityPubId = normalizeUrl((<any>incomingActor).id);
    } else {
        this.logger.error(`Incoming inbox activity for '${username}' has no 'actor' or 'as:actor' property with a valid ID. Activity: ${JSON.stringify(activity)}`);
        throw new BadRequestException('Activity has no actor specified.');
    }

    // FIX: Add more robust extraction and logging for activity.object
    this.logger.debug(`AppService: Raw activity.object from decorator: ${JSON.stringify(activity.object)}`);
    this.logger.debug(`AppService: Type of activity.object from decorator: ${typeof activity.object}`);

    let objectActivityPubId: string | undefined;
    // Prioritize 'object' (compacted form), then 'as:object' (uncompacted form)
    const rawObjectFromPayload = activity.object || activity['as:object'];

    if (typeof rawObjectFromPayload === 'string') {
        objectActivityPubId = rawObjectFromPayload;
    } else if (typeof rawObjectFromPayload === 'object' && rawObjectFromPayload !== null) {
        // If it's an object, try to get its 'id' or 'url'
        objectActivityPubId = rawObjectFromPayload.id || rawObjectFromPayload.url;
    }
    // If objectActivityPubId is still undefined, it will be handled by normalizeUrl('')

    // Ensure objectActivityPubId is a string for normalizeUrl, defaulting to empty string if still undefined
    const normalizedObjectActivityPubId = normalizeUrl(objectActivityPubId || '');

    this.logger.debug(`AppService: Extracted objectActivityPubId before normalizeUrl: ${objectActivityPubId}`);
    this.logger.debug(`AppService: Final normalizedObjectActivityPubId for job: ${normalizedObjectActivityPubId}`);


    // Enqueue the activity for processing by the InboxProcessor
    await this.inboxQueue.add(
      'process-inbox-activity',
      {
        activityId: activityPubId,
        actorActivityPubId: actorActivityPubId,
        objectActivityPubId: normalizedObjectActivityPubId, // Use the correctly extracted and normalized object ID
        type: activity.type,
        data: activity, // Store the raw activity payload
        localActorId: localActor.id, // Pass the internal ID of the local recipient actor
      },
      {
        jobId: activityPubId, // Use ActivityPub ID as jobId for deduplication in BullMQ
        attempts: 3, // Retry failed jobs
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    this.logger.log(`Inbox activity '${activityPubId}' enqueued for '${username}'.`);
  }

  /**
   * Handles an incoming ActivityPub POST request to an actor's outbox from a local user.
   * Enqueues the activity for federated dispatch.
   * @param username The username of the local actor whose outbox is being posted to.
   * @param activity The raw ActivityPub JSON-LD payload.
   * @param localUserId The internal ID of the authenticated local user performing the action.
   */
  async handleOutboxPost(
    username: string,
    activity: any,
    localUserId: string,
  ): Promise<void> {
    this.logger.log(`Enqueueing outbox activity for user '${username}'.`);

    const localActor = await this.actorService.findActorForUser(localUserId);
    if (!localActor || localActor.preferredUsername !== username) {
      this.logger.warn(`Outbox: User '${localUserId}' not authorized to post to actor '${username}'s outbox.`);
      throw new NotFoundException(`Actor '${username}' not found or unauthorized.`);
    }

    // Generate a unique ID for the activity if not already present
    const activityPubId = normalizeUrl(activity.id || `${this.instanceBaseUrl}/activities/${randomUUID()}`);
    activity.id = activityPubId; // Ensure the activity payload has its ID

    // Ensure actor is correctly set in the activity payload
    activity.actor = localActor.activityPubId;

    // Persist the outgoing activity locally
    const newActivityEntity = this.activityRepository.create({
      activityPubId: activityPubId,
      type: activity.type,
      actorActivityPubId: localActor.activityPubId,
      objectActivityPubId: normalizeUrl(activity.object?.id || activity.object), // Normalize object ID
      data: activity,
      actor: localActor,
    });
    const savedActivity = await this.activityRepository.save(newActivityEntity);

    await this.outboxQueue.add(
      'deliver-activity',
      {
        activityId: savedActivity.id, // Use internal DB ID for job tracking
        activity: savedActivity.data, // Pass the full activity payload
        actorId: localActor.id, // Pass the internal ID of the local sending actor
      },
      {
        jobId: savedActivity.id, // Use internal DB ID as jobId for tracing
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    this.logger.log(`Outbox activity '${activityPubId}' enqueued for delivery from '${username}'.`);
  }

  /**
   * Handles a generic incoming ActivityPub POST request (e.g., to a shared inbox).
   * Enqueues the activity for asynchronous processing.
   * @param activity The raw ActivityPub JSON-LD payload.
   * @param req The Express request object.
   */
  async handleRelayPost(activity: any, req: Request): Promise<void> {
    this.logger.log(`Enqueueing relay activity.`);

    const activityPubId = normalizeUrl(activity.id || `${this.instanceBaseUrl}/activities/${randomUUID()}`);
    
    // RESOLVE: Check both 'actor' and 'as:actor' due to JSON-LD aliasing
    let incomingActor: string | object | undefined = activity.actor || activity['as:actor'];
    let actorActivityPubId: string;

    if (typeof incomingActor === 'string') {
        actorActivityPubId = normalizeUrl(incomingActor);
    } else if (typeof incomingActor === 'object' && incomingActor !== null && (<any>incomingActor).id) {
        actorActivityPubId = normalizeUrl((<any>incomingActor).id);
    } else {
        this.logger.error(`Incoming relay activity has no 'actor' or 'as:actor' property with a valid ID. Activity: ${JSON.stringify(activity)}`);
        throw new BadRequestException('Activity has no actor specified.');
    }

    const objectActivityPubId = normalizeUrl(activity.object?.id || activity.object);

    // TODO: Determine the appropriate local actor(s) to route this activity to.
    // For a shared inbox, this typically means sending to all followers' inboxes,
    // but might also involve saving relevant public content locally.
    // For now, we might just enqueue it without a specific local actor recipient,
    // or route to a "default" local actor's inbox if needed.
    // For now, let's process it similarly to a direct inbox post but without a specific localActorId.

    await this.inboxQueue.add(
      'process-inbox-activity',
      {
        activityId: activityPubId,
        actorActivityPubId: actorActivityPubId,
        objectActivityPubId: objectActivityPubId,
        type: activity.type,
        data: activity,
        localActorId: null, // No specific local actor recipient for relay, handlers will adapt
      },
      {
        jobId: activityPubId, // Use ActivityPub ID as jobId for deduplication in BullMQ
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    this.logger.log(`Relay activity '${activityPubId}' enqueued.`);
  }

  /**
   * Retrieves a paginated collection of followers for a given actor.
   * @param username The preferred username of the actor.
   * @param page The page number for pagination.
   * @param perPage The number of items per page.
   * @returns An ActivityPub OrderedCollection page.
   */
  async getFollowersCollection(username: string, page: number, perPage: number): Promise<any> {
    const actor = await this.actorService.findActorByPreferredUsername(username);
    if (!actor) {
      throw new NotFoundException(`Actor with username '${username}' not found.`);
    }

    const [follows, totalItems] = await this.followRepository.findAndCount({
      where: { followedActivityPubId: actor.activityPubId }, // 'object' is the actor being followed
      skip: (page - 1) * perPage,
      take: perPage,
      order: { createdAt: 'DESC' },
    });

    const items = follows.map(follow => follow.followerActivityPubId); // Return the IDs of the followers

    const collectionId = actor.followersUrl; // The canonical URL for the followers collection
    const currentPageId = `${collectionId}?page=${page}&perPage=${perPage}`;
    const firstPageId = `${collectionId}?page=1&perPage=${perPage}`;
    const totalPages = Math.ceil(totalItems / perPage);
    const lastPageId = `${collectionId}?page=${totalPages}&perPage=${perPage}`;
    const prevPageId = page > 1 ? `${collectionId}?page=${page - 1}&perPage=${perPage}` : undefined;
    const nextPageId = page < totalPages ? `${collectionId}?page=${page + 1}&perPage=${perPage}` : undefined;

    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: collectionId,
      type: 'OrderedCollectionPage', // For paginated results
      totalItems: totalItems,
      partOf: collectionId,
      first: firstPageId,
      last: lastPageId,
      prev: prevPageId,
      next: nextPageId,
      current: currentPageId,
      orderedItems: items,
    };
  }

  /**
   * Retrieves a paginated collection of actors that a given actor is following.
   * @param username The preferred username of the actor.
   * @param page The page number for pagination.
   * @param perPage The number of items per page.
   * @returns An ActivityPub OrderedCollection page.
   */
  async getFollowingCollection(username: string, page: number, perPage: number): Promise<any> {
    const actor = await this.actorService.findActorByPreferredUsername(username);
    if (!actor) {
      throw new NotFoundException(`Actor with username '${username}' not found.`);
    }

    const [follows, totalItems] = await this.followRepository.findAndCount({
      where: { followerActivityPubId: normalizeUrl(actor.activityPubId) }, // 'actor' is the one doing the following
      skip: (page - 1) * perPage,
      take: perPage,
      order: { createdAt: 'DESC' },
    });

    const items = follows.map(follow => follow.followedActivityPubId); // Return the IDs of followed actors

    const collectionId = actor.followingUrl;
    const currentPageId = `${collectionId}?page=${page}&perPage=${perPage}`;
    const firstPageId = `${collectionId}?page=1&perPage=${perPage}`;
    const totalPages = Math.ceil(totalItems / perPage);
    const lastPageId = `${collectionId}?page=${totalPages}&perPage=${perPage}`;
    const prevPageId = page > 1 ? `${collectionId}?page=${page - 1}&perPage=${perPage}` : undefined;
    const nextPageId = page < totalPages ? `${collectionId}?page=${page + 1}&perPage=${perPage}` : undefined;

    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: collectionId,
      type: 'OrderedCollectionPage',
      totalItems: totalItems,
      partOf: collectionId,
      first: firstPageId,
      last: lastPageId,
      prev: prevPageId,
      next: nextPageId,
      current: currentPageId,
      orderedItems: items,
    };
  }

  /**
   * Retrieves a paginated collection of activities from an actor's outbox.
   * @param username The preferred username of the actor.
   * @param page The page number for pagination.
   * @param perPage The number of items per page.
   * @param authenticatedUserId (Optional) The ID of the authenticated user making the request.
   * @returns An ActivityPub OrderedCollection page.
   */
  async getOutboxCollection(username: string, page: number, perPage: number, authenticatedUserId?: string): Promise<any> {
    const actor = await this.actorService.findActorByPreferredUsername(username);
    if (!actor) {
      throw new NotFoundException(`Actor with username '${username}' not found.`);
    }

    // Only allow access to the outbox if the requesting user is the owner of the outbox,
    // OR if the activities are publicly addressed (though outbox typically contains public content).
    // For simplicity, for now, we'll assume outbox is generally public or controlled by the actor.
    // More complex authorization might involve checking 'to' or 'audience' fields.
    const isOwner = authenticatedUserId ? (await this.actorService.findActorForUser(authenticatedUserId))?.activityPubId === actor.activityPubId : false;

    const [activities, totalItems] = await this.activityRepository.findAndCount({
      where: { actorActivityPubId: actor.activityPubId },
      skip: (page - 1) * perPage,
      take: perPage,
      order: { createdAt: 'DESC' },
    });

    const items = activities.map(activity => activity.activityPubId);

    const collectionId = actor.outbox;
    const currentPageId = `${collectionId}?page=${page}&perPage=${perPage}`;
    const firstPageId = `${collectionId}?page=1&perPage=${perPage}`;
    const totalPages = Math.ceil(totalItems / perPage);
    const lastPageId = `${collectionId}?page=${totalPages}&perPage=${perPage}`;
    const prevPageId = page > 1 ? `${collectionId}?page=${page - 1}&perPage=${perPage}` : undefined;
    const nextPageId = page < totalPages ? `${collectionId}?page=${page + 1}&perPage=${perPage}` : undefined;

    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: collectionId,
      type: 'OrderedCollectionPage',
      totalItems: totalItems,
      partOf: collectionId,
      first: firstPageId,
      last: lastPageId,
      prev: prevPageId,
      next: nextPageId,
      current: currentPageId,
      orderedItems: items,
    };
  }

  /**
   * Retrieves a paginated collection of activities from a local actor's inbox.
   * @param username The preferred username of the local actor.
   * @param page The page number for pagination.
   * @param perPage The number of items per page.
   * @param authenticatedUserId The ID of the authenticated user making the request.
   * @returns An ActivityPub OrderedCollection page representing the actor's inbox.
   * @throws UnauthorizedException if the requesting user is not the inbox owner.
   */
  async getInboxCollection(username: string, page: number, perPage: number, authenticatedUserId: string): Promise<any> {
      this.logger.debug(`Fetching inbox for actor: ${username}, page: ${page}, perPage: ${perPage}`);
      const actor = await this.actorService.findActorByPreferredUsername(username);
      if (!actor) {
          throw new NotFoundException(`Actor with username '${username}' not found.`);
      }

      const requestingActor = await this.actorService.findActorForUser(authenticatedUserId);

      // Ensure the requesting user is the owner of this inbox
      if (!requestingActor || requestingActor.activityPubId !== actor.activityPubId) {
          this.logger.warn(`Unauthorized access attempt to inbox of '${username}' by actor '${requestingActor?.activityPubId || 'N/A'}'`);
          throw new UnauthorizedException('Access to this inbox is restricted to the owner.');
      }

      // CRITICAL FIX: Filter by recipientActivityPubId, not actorActivityPubId
      const [activities, totalItems] = await this.activityRepository.findAndCount({
          where: { recipientActivityPubId: normalizeUrl(actor.activityPubId) }, // CORRECTED FILTER
          skip: (page - 1) * perPage,
          take: perPage,
          order: { createdAt: 'DESC' }, // Order by newest first
      });

      const items = activities.map(act => act.activityPubId); // Return the IDs of the activities

      // Construct collection URLs
      const collectionId = actor.inbox;
      const currentPageId = `${collectionId}?page=${page}&perPage=${perPage}`;
      const firstPageId = `${collectionId}?page=1&perPage=${perPage}`;
      const totalPages = Math.ceil(totalItems / perPage);
      const lastPageId = `${collectionId}?page=${totalPages}&perPage=${perPage}`;
      const prevPageId = page > 1 ? `${collectionId}?page=${page - 1}&perPage=${page}` : undefined;
      const nextPageId = page < totalPages ? `${collectionId}?page=${page + 1}&perPage=${page}` : undefined;

      return {
          '@context': 'https://www.w3.org/ns/activitystreams',
          id: collectionId,
          type: 'OrderedCollectionPage',
          totalItems: totalItems,
          partOf: collectionId,
          first: firstPageId,
          last: lastPageId,
          prev: prevPageId,
          next: nextPageId,
          current: currentPageId,
          orderedItems: items,
      };
  }


  /**
   * Retrieves a paginated collection of objects that a given actor has liked.
   * @param username The preferred username of the actor.
   * @param page The page number for pagination.
   * @param perPage The number of items per page.
   * @returns An ActivityPub OrderedCollection page.
   */
  async getLikedCollection(username: string, page: number, perPage: number): Promise<any> {
    const actor = await this.actorService.findActorByPreferredUsername(username);
    if (!actor) {
      throw new NotFoundException(`Actor with username '${username}' not found.`);
    }

    const [likes, totalItems] = await this.likeRepository.findAndCount({
      where: { likerActivityPubId: actor.activityPubId },
      skip: (page - 1) * perPage,
      take: perPage,
      order: { createdAt: 'DESC' },
    });

    const items = likes.map(like => like.likedObjectActivityPubId);

    const collectionId = actor.likedUrl;
    const currentPageId = `${collectionId}?page=${page}&perPage=${perPage}`;
    const firstPageId = `${collectionId}?page=1&perPage=${perPage}`;
    const totalPages = Math.ceil(totalItems / perPage);
    const lastPageId = `${collectionId}?page=${totalPages}&perPage=${perPage}`;
    const prevPageId = page > 1 ? `${collectionId}?page=${page - 1}&perPage=${perPage}` : undefined;
    const nextPageId = page < totalPages ? `${collectionId}?page=${page + 1}&perPage=${perPage}` : undefined;

    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: collectionId,
      type: 'OrderedCollectionPage',
      totalItems: totalItems,
      partOf: collectionId,
      first: firstPageId,
      last: lastPageId,
      prev: prevPageId,
      next: nextPageId,
      current: currentPageId,
      orderedItems: items,
    };
  }

  /**
   * Retrieves a paginated collection of public flashcards created by a given actor.
   * @param username The preferred username of the actor.
   * @param page The page number for pagination.
   * @param perPage The number of items per page.
   * @returns An ActivityPub OrderedCollection page.
   */
  async getCreatedFlashcardsCollection(username: string, page: number, perPage: number, activeUser: UserEntity | null): Promise<any> {
      this.logger.debug(`Fetching created flashcards for actor: ${username}, page: ${page}, perPage: ${perPage}`);
      const actor = await this.actorService.findActorByPreferredUsername(username);
      if (!actor) {
          throw new NotFoundException(`Actor with username '${username}' not found.`);
      }

      const [flashcards, totalItems] = await this.flashcardRepository.findAndCount({
          where: {
              attributedToActivityPubId: actor.activityPubId,
              isPublic: username === activeUser?.username ? false : true, // Only include public flashcards
              deletedAt: IsNull(), // Ensure not soft-deleted
          },
          skip: (page - 1) * perPage,
          take: perPage,
          order: { createdAt: 'DESC' },
      });

      // The ActivityPub collection should contain the IDs of the objects; for now we are returning the entire flashcard.
      const items = flashcards.map(fc => fc.activityPubId);

      // Construct the collection URL for this endpoint
      const collectionId = `${actor.activityPubId}/flashcards`; // Canonical URL for this specific collection
      const currentPageId = `${collectionId}?page=${page}&perPage=${perPage}`;
      const firstPageId = `${collectionId}?page=1&perPage=${perPage}`;
      const totalPages = Math.ceil(totalItems / perPage);
      const lastPageId = `${collectionId}?page=${totalPages}&perPage=${perPage}`;
      const prevPageId = page > 1 ? `${collectionId}?page=${page - 1}&perPage=${perPage}` : undefined;
      const nextPageId = page < totalPages ? `${collectionId}?page=${page + 1}&perPage=${perPage}` : undefined;

      return {
          '@context': 'https://www.w3.org/ns/activitystreams',
          id: collectionId,
          type: 'OrderedCollectionPage',
          totalItems: totalItems,
          partOf: collectionId,
          first: firstPageId,
          last: lastPageId,
          prev: prevPageId,
          next: nextPageId,
          current: currentPageId,
          orderedItems: items,
      };
  }

  /**
   * Retrieves a specific ActivityPub Activity object by its full ActivityPub ID.
   * @param activityPubId The full ActivityPub URI of the activity.
   * @returns The raw ActivityPub object data.
   */
  async getActivityObject(activityPubId: string): Promise<ActivityEntity> {
    this.logger.debug(`Fetching activity object from DB for ID: ${activityPubId}`);
    const activity = await this.activityRepository.findOne({
      where: { activityPubId: normalizeUrl(activityPubId) },
    });
    if (!activity) {
      this.logger.warn(`Activity object '${activityPubId}' not found in local DB.`);
      throw new NotFoundException(`Activity object with ID '${activityPubId}' not found.`);
    }
    return activity;
  }

  /**
   * Retrieves the local JSON-LD representation of a content object by its ActivityPub ID.
   * This method attempts to find the object in specific entity repositories (Flashcard, FlashcardModel)
   * before falling back to a generic ContentObjectEntity.
   * @param objectId The ActivityPub ID (IRI) of the object to retrieve.
   * @returns The JSON-LD representation of the object.
   * @throws NotFoundException if the object is not found locally.
   */
  async getLocalContentObject(objectId: string): Promise<any> { // Updated return type to `any` for flexibility
      this.logger.debug(`Fetching local content object from DB for ID: ${objectId}`);

      let normalizedObjectId: string;

      // FIX: Check if objectId is a UUID. If so, construct the full canonical URI.
      // A simple regex check for UUID format.
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(objectId)) {
          // If it's a UUID, assume it's a local object and construct its full ActivityPub ID
          normalizedObjectId = normalizeUrl(`${this.instanceBaseUrl}/objects/${objectId}`);
          this.logger.debug(`AppService: Transformed UUID '${objectId}' to full URI: '${normalizedObjectId}' for lookup.`);
      } else {
          // Otherwise, assume it's already a full URI and normalize it
          normalizedObjectId = normalizeUrl(objectId);
      }


      // First, try to find it as a FlashcardEntity
      const flashcard = await this.flashcardRepository.findOne({
          where: { activityPubId: normalizedObjectId, deletedAt: IsNull() }, // Use normalizedObjectId
          relations: ['eduModel', 'creator'], // Ensure relations are loaded if needed for mapping
      });

      if (flashcard) {
          // Map FlashcardEntity to its ActivityPub JSON-LD representation
          // This mapping should be consistent with the EducationPub Vocabulary Specification
          return {
              '@context': [
                  'https://www.w3.org/ns/activitystreams',
                  'https://social.bleauweb.org/ns/education-pub', // Our custom context
              ],
              id: flashcard.activityPubId,
              type: ['edu:Flashcard', 'Document'], // Consistent with edu:Flashcard definition
              name: flashcard.name,
              // REMOVED: 'summary' property as it does not exist on FlashcardEntity
              url: flashcard.activityPubId, // Canonical URL is its ID
              attributedTo: flashcard.attributedToActivityPubId,
              'edu:model': flashcard.eduModel?.activityPubId, // Link to FlashcardModel (use optional chaining)
              'edu:fieldsData': flashcard.eduFieldsData,
              'edu:tags': flashcard.eduTags,
              published: flashcard.createdAt.toISOString(),
              updated: flashcard.updatedAt.toISOString(),
              // Include raw data for internal debugging/completeness, but not strictly part of AP spec
              // data: flashcard,
          };
      }

      // Second, try to find it as a FlashcardModelEntity
      const flashcardModel = await this.flashcardModelRepository.findOne({
          where: { activityPubId: normalizedObjectId }, // Use normalizedObjectId
      });

      if (flashcardModel) {
          // Map FlashcardModelEntity to its ActivityPub JSON-LD representation
          // This mapping should be consistent with the EducationPub Vocabulary Specification
          return {
              '@context': [
                  'https://www.w3.org/ns/activitystreams',
                  'https://social.bleauweb.org/ns/education-pub', // Our custom context
              ],
              id: flashcardModel.activityPubId,
              type: ['edu:FlashcardModel', 'Object'], // FlashcardModel is also a generic Object
              name: flashcardModel.name,
              summary: flashcardModel.summary,
              url: flashcardModel.activityPubId, // Canonical URL is its ID
              'edu:fields': flashcardModel.fields,
              'edu:cardTemplates': flashcardModel.cardTemplates,
              published: flashcardModel.createdAt.toISOString(),
              updated: flashcardModel.updatedAt.toISOString(),
              // data: flashcardModel,
          };
      }

      // If not a Flashcard or FlashcardModel, try to find it as a generic ContentObjectEntity
      const contentObject = await this.contentObjectRepository.findOne({
          where: { activityPubId: normalizedObjectId }, // Use normalizedObjectId
      });

      if (contentObject) {
          // For generic ContentObject, return its stored data
          return contentObject.data; // Assuming `data` column already holds the full JSON-LD
      }

      this.logger.warn(`Local content object '${objectId}' not found in local DB.`);
      throw new NotFoundException(`Local content object with ID '${objectId}' not found.`);
  }

  /**
   * Retrieves a paginated public timeline of activities.
   * This typically includes public posts, announces, etc.
   * @param page The page number for pagination.
   * @param perPage The number of items per page.
   * @returns An ActivityPub OrderedCollection page.
   */
  async getPublicTimeline(page: number, perPage: number): Promise<any> {
    // For MVP, public timeline can be a combination of:
    // 1. All local public flashcards
    // 2. All incoming 'Create' activities with public visibility
    // 3. All incoming 'Announce' activities
    // 4. All incoming 'Like' activities

    // Fetch public flashcards
    const [publicFlashcards, totalFlashcards] = await this.flashcardRepository.findAndCount({
      where: { isPublic: true, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
      relations: ['eduModel', 'creator'],
    });

    // You might also fetch recent public activities (Create, Announce)
    // For a simple MVP, let's just use activities that are public.
    const [publicActivities, totalActivities] = await this.activityRepository.findAndCount({
      where: {
        type: In(['Create', 'Announce', 'Like']), // Include relevant public activity types
        // This is a simplification; a true public timeline would need to filter activities
        // based on their 'to' or 'audience' properties to determine actual public visibility.
        // For MVP, we assume activities sent to "Public" are stored as such.
      },
      order: { createdAt: 'DESC' },
    });

    // Combine and sort by createdAt. This is a naive merge, a real timeline
    // would involve more complex aggregation and sorting from various sources.
    const combinedItems = [
      ...publicFlashcards.map(fc => ({ type: 'edu:Flashcard', id: fc.activityPubId, data: fc, createdAt: fc.createdAt })),
      ...publicActivities.map(act => ({ type: act.type, id: act.activityPubId, data: act.data, createdAt: act.createdAt })),
    ].sort((a, b) => {
        const dateA = new Date((a.data as any).createdAt || (a.data as any).published || (a.data as any).updated);
        const dateB = new Date((b.data as any).createdAt || (b.data as any).published || (b.data as any).updated);
        return dateB.getTime() - dateA.getTime(); // Newest first
    });

    // Apply pagination after sorting
    const paginatedItems = combinedItems.slice((page - 1) * perPage, page * perPage);

    const totalItems = totalFlashcards + totalActivities; // A rough total for now
    const collectionId = `${this.instanceBaseUrl}/public`;
    const currentPageId = `${collectionId}?page=${page}&perPage=${perPage}`;
    const firstPageId = `${collectionId}?page=1&perPage=${perPage}`;
    const totalPages = Math.ceil(totalItems / perPage);
    const lastPageId = `${collectionId}?page=${totalPages}&perPage=${perPage}`;
    const prevPageId = page > 1 ? `${collectionId}?page=${page - 1}&perPage=${perPage}` : undefined;
    const nextPageId = page < totalPages ? `${collectionId}?page=${page + 1}&perPage=${perPage}` : undefined;

    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: collectionId,
      type: 'OrderedCollectionPage',
      totalItems: totalItems,
      partOf: collectionId,
      first: firstPageId,
      last: lastPageId,
      prev: prevPageId,
      next: nextPageId,
      current: currentPageId,
      orderedItems: paginatedItems.map(item => item.id), // Return just the IDs for the collection
    };
  }

  /**
   * Retrieves NodeInfo v2.0 information for the instance.
   * @returns NodeInfo v2.2 object.
   */
  async getNodeInfo2(): Promise<any> {
    // This is a basic NodeInfo v2.0 structure. You can expand it with more details.
    // See: https://nodeinfo.diaspora.software/ns/schema/2.0
    const [localActors, totalLocalActors] = await this.actorRepository.findAndCount({ where: { isLocal: true } });
    const [remoteActors, totalRemoteActors] = await this.actorRepository.findAndCount({ where: { isLocal: false } });

    // Count of posts (e.g., Flashcards and other ContentObjects created locally)
    const totalLocalFlashcards = await this.flashcardRepository.count({ where: { isPublic: true, deletedAt: IsNull() }});
    const totalLocalNotes = await this.contentObjectRepository.count({ where: { attributedToActivityPubId: In(localActors.map(a => a.activityPubId)) }});
    const totalPosts = totalLocalFlashcards + totalLocalNotes; // Sum up relevant local content types

    return {
      version: '2.0',
      software: {
        name: 'ActivityEducation',
        version: '0.1.0-alpha', // Your application's version
        repository: 'https://github.com/activityeducation/backend', // Link to your repository
        homepage: this.instanceBaseUrl, // Your instance homepage
      },
      protocols: ['activitypub', 'educationpub'],
      services: {
        outbound: [], // e.g., 'atom', 'rss' if you support those
        inbound: [], // e.g., 'atom', 'rss' if you consume those
      },
      usage: {
        users: {
          total: totalLocalActors,
          activeMonth: 0, // Implement logic to count active users in a month
          activeHalfyear: 0, // Implement logic to count active users in half a year
        },
        localPosts: totalPosts, // Total number of locally created public posts/flashcards
        // Implement logic for localComments, etc.
      },
      openRegistrations: false, // Whether new user registrations are open
      // NodeName, NodeDescription, etc. can be added from config
      metadata: {
        name: 'EduPub'
      },
    };
  }
}
