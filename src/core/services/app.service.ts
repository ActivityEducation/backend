import {
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
  ConflictException,
  BadRequestException, // Ensure this is imported
  Inject,
  OnApplicationBootstrap, // Import Inject for custom token injection
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm'; // For injecting TypeORM repositories
import { Repository, Not, IsNull } from 'typeorm'; // Import Not and IsNull for advanced queries
import {
  generateKeyPairSync,
  createHash,
  createSign,
  createVerify,
} from 'crypto'; // Node.js built-in crypto module for key generation and signing
import { ConfigService } from '@nestjs/config'; // For accessing environment variables
import { InjectQueue } from '@nestjs/bullmq'; // For injecting BullMQ queues
import { Queue } from 'bullmq'; // BullMQ Queue type
import { RemoteObjectService } from './remote-object.service';
import * as bcrypt from 'bcrypt';
import { Redis } from 'ioredis'; // Import Redis type
import * as sshpk from 'sshpk'; // Import sshpk for key parsing and validation
import { ActorEntity } from '../../features/activitypub/entities/actor.entity';
import { ActivityEntity } from '../../features/activitypub/entities/activity.entity';
import { FollowEntity } from '../../features/activitypub/entities/follow.entity';
import { ContentObjectEntity } from '../../features/activitypub/entities/content-object.entity';
import { LikeEntity } from '../../features/activitypub/entities/like.entity';
import { InvalidSignatureException } from '../../shared/exceptions/invalid-signature.exception';
import { LoggerService } from '../../shared/services/logger.service';
import { ActivityPubActivity } from 'src/features/activitypub/interfaces/activitypub.interface';

@Injectable()
export class AppService implements OnApplicationBootstrap {
  private readonly instanceBaseUrl: string;

  constructor(
    @InjectRepository(ActorEntity)
    private readonly actorRepository: Repository<ActorEntity>,
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: Repository<ActivityEntity>,
    @InjectRepository(FollowEntity)
    private readonly followRepository: Repository<FollowEntity>,
    @InjectRepository(ContentObjectEntity)
    private readonly contentObjectRepository: Repository<ContentObjectEntity>,
    @InjectRepository(LikeEntity)
    private readonly likeRepository: Repository<LikeEntity>,
    private readonly configService: ConfigService,
    @InjectQueue('inbox') private readonly inboxQueue: Queue,
    @InjectQueue('outbox') private readonly outboxQueue: Queue,
    private readonly logger: LoggerService,
    private readonly remoteObjectService: RemoteObjectService,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis, // Changed to use the custom token 'REDIS_CLIENT'
  ) {
    this.logger.setContext('AppService');
    const baseUrl = this.configService.get<string>('INSTANCE_BASE_URL');
    if (!baseUrl) {
      this.logger.error(
        'INSTANCE_BASE_URL is not defined in environment variables.',
      );
      throw new Error('INSTANCE_BASE_URL is not defined.');
    }
    this.instanceBaseUrl = baseUrl;
  }

  public onApplicationBootstrap(): void {
    this.createInitUser();
  }

  /**
   * Generates a new RSA key pair for an actor.
   * In a production environment, this should be replaced with a secure KMS integration.
   * @returns An object containing the public and private keys in PEM format.
   */
  generateActorKeyPair(): { publicKey: string; privateKey: string } {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });
    return { publicKey, privateKey };
  }

  /**
   * Creates a new local actor (user) in the system.
   * @param username The desired username for the new actor.
   * @param name The display name for the new actor.
   * @param summary A short summary/bio for the new actor.
   * @returns The newly created ActorEntity.
   * @throws ConflictException if the username already exists.
   */
  async createActor(username: string, name: string = username, summary: string = `A new user on ${new URL(this.instanceBaseUrl).hostname}.`): Promise<ActorEntity> {
    this.logger.log(`Attempting to create actor: '${username}'.`);

    const existingActor = await this.actorRepository.findOne({
      where: { preferredUsername: username },
    });
    if (existingActor) {
      throw new ConflictException(
        `Actor with username '${username}' already exists.`,
      );
    }

    const { publicKey, privateKey } = this.generateActorKeyPair();
    const actorId = `${this.instanceBaseUrl}/actors/${username}`;

    // Construct the ActivityPub profile for the new actor
    const actorProfile = {
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        'https://w3id.org/security/v1',
      ],
      id: actorId,
      type: 'Person',
      preferredUsername: username,
      name: name, // Use provided name
      summary: summary, // Use provided summary
      inbox: `${actorId}/inbox`,
      outbox: `${actorId}/outbox`,
      followers: `${actorId}/followers`,
      following: `${actorId}/following`,
      liked: `${actorId}/liked`,
      publicKey: {
        id: `${actorId}#main-key`,
        owner: actorId,
        publicKeyPem: publicKey,
      },
      // Optional: endpoints for shared inbox, upload media, etc.
      endpoints: {
        // This is where a shared inbox would be advertised if implemented
        // sharedInbox: `${this.instanceBaseUrl}/inbox`,
      },
    };

    const newActor = this.actorRepository.create({
      preferredUsername: username,
      activityPubId: actorId,
      name: name, // Explicitly set the top-level 'name' property
      publicKeyPem: publicKey,
      privateKeyPem: privateKey, // In production, store securely in KMS
      data: actorProfile, // Store the full ActivityPub profile as JSONB
    });

    await this.actorRepository.save(newActor);
    this.logger.log(
      `Actor '${username}' created successfully with ActivityPub ID: '${actorId}'.`,
    );
    return newActor;
  }

  /**
   * Retrieves an actor's profile by username.
   * @param username The username of the actor.
   * @returns The ActorEntity if found.
   * @throws NotFoundException if the actor does not exist.
   */
  async getActorProfile(username: string): Promise<ActorEntity> {
    // Renamed from getActorByUsername
    this.logger.debug(`Fetching actor profile by username: '${username}'.`);
    const actor = await this.actorRepository.findOne({
      where: { preferredUsername: username },
    }); // Changed to preferredUsername
    if (!actor) {
      throw new NotFoundException(
        `Actor with username '${username}' not found.`,
      );
    }
    return actor;
  }

  /**
   * Retrieves an actor's profile by ActivityPub ID.
   * @param activityPubId The ActivityPub ID (URI) of the actor.
   * @returns The ActorEntity if found.
   * @throws NotFoundException if the actor does not exist.
   */
  async getActorByActivityPubId(activityPubId: string): Promise<ActorEntity> {
    this.logger.debug(`Fetching actor by ActivityPub ID: '${activityPubId}'.`);
    const actor = await this.actorRepository.findOne({
      where: { activityPubId },
    });
    if (!actor) {
      throw new NotFoundException(
        `Actor with ActivityPub ID '${activityPubId}' not found.`,
      );
    }
    return actor;
  }

  /**
   * Handles an incoming ActivityPub activity for a local actor's inbox.
   * Stores the activity in the database and enqueues it for asynchronous processing.
   * @param username The username of the local actor receiving the activity.
   * @param activity The incoming ActivityPub payload.
   * @param rawBody The raw request body (Buffer), essential for Digest verification.
   */
  async handleInboxPost(username: string, activity: any): Promise<void> {
    this.logger.log(
      `Received incoming inbox post for actor: '${username}', Activity Type: '${
        activity.type || 'N/A'
      }', Activity ID: '${activity.id || 'N/A'}'.`,
    );

    // Check if the actor with given username exists locally.
    const localActor = await this.getActorProfile(username); // Using getActorProfile
    if (!localActor) {
      this.logger.warn(
        `Inbox post for non-existent local actor: '${username}'.`,
      );
      throw new NotFoundException(`Actor '${username}' not found.`);
    }

    // Check for existing activity to prevent duplicates
    if (activity.id) {
      const existingActivity = await this.activityRepository.findOne({
        where: { activityPubId: activity.id },
      });
      if (existingActivity) {
        this.logger.log(
          `Incoming activity with ID '${activity.id}' already exists. Skipping storage.`,
        );
        // If it's a duplicate, we might still want to re-enqueue for processing
        // if the original processing failed or was incomplete. For now, skip.
        return;
      }
      this.logger.debug(
        `Incoming activity has ID: '${activity.id}'. Proceeding with storage.`,
      );
    } else {
      this.logger.warn(
        `Incoming activity has no 'id' property. Cannot check for duplicates. Activity: ${JSON.stringify(activity)}`,
      );
    }

    const newActivity = this.activityRepository.create({
      activityPubId: activity.id,
      type: activity.type,
      actorActivityPubId: activity?.['as:actor'].id,
      objectActivityPubId: activity?.['as:object'].id, // Handle both object URI and embedded object
      inReplyToActivityPubId: activity.inReplyTo, // TODO: Fix this as this is likely not the correct property after compact of JsonLD.
      data: activity, // Store the full ActivityPub JSON-LD payload
      actor: localActor
    });

    await this.activityRepository.save(newActivity);
    this.logger.log(
      `Activity '${activity.id || 'N/A'}' of type '${activity.type || 'N/A'}' stored in database for actor '${username}'.`,
    );

    // Enqueue the activity for asynchronous processing by the InboxProcessor
    await this.inboxQueue.add('processActivity', {
      activityId: newActivity.id,
    });
    this.logger.log(
      `Activity '${activity.id || 'N/A'}' enqueued for inbox processing.`,
    );
  }

  async createInitUser() {
    // Create a default 'testuser' actor if it doesn't exist
    try {
      await this.getActorProfile('testuser');
      this.logger.log('Default actor "testuser" already exists.');
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.log('Default actor "testuser" not found, creating...');
        try {
          let defaultPrivateKeyPem = this.configService.get<string>(
            'DEFAULT_ACTOR_PRIVATE_KEY_PEM',
          );
          let newActor: ActorEntity;

          if (defaultPrivateKeyPem) {
            this.logger.warn(
              'Using DEFAULT_ACTOR_PRIVATE_KEY_PEM from environment. This is INSECURE for production!',
            );
            
            let publicKeyPemFromPrivate: string;
            try {
              // Parse the private key to derive the public key
              const privateKey = sshpk.parsePrivateKey(defaultPrivateKeyPem, 'pem');
              publicKeyPemFromPrivate = privateKey.toPublic().toString('pem');
              this.logger.debug('Successfully derived public key from provided private key.');
            } catch (keyError) {
              this.logger.error(`Failed to parse DEFAULT_ACTOR_PRIVATE_KEY_PEM or derive public key: ${keyError.message}. Generating new key pair instead.`, keyError.stack);
              // Fallback to generating a new key pair if the provided key is invalid
              const { publicKey, privateKey } = this.generateActorKeyPair();
              publicKeyPemFromPrivate = publicKey;
              defaultPrivateKeyPem = privateKey; // Use the newly generated private key
            }

            const actorId = `${this.configService.get<string>('INSTANCE_BASE_URL')}/actors/testuser`;
            const actorProfile = {
              '@context': [
                'https://www.w3.org/ns/activitystreams',
                'https://w3id.org/security/v1',
              ],
              id: actorId,
              type: 'Person',
              preferredUsername: 'testuser',
              name: 'Test User',
              summary: 'A default test user for development.',
              inbox: `${actorId}/inbox`,
              outbox: `${actorId}/outbox`,
              followers: `${actorId}/followers`,
              following: `${actorId}/following`,
              liked: `${actorId}/liked`,
              publicKey: {
                id: `${actorId}#main-key`,
                owner: actorId,
                publicKeyPem: publicKeyPemFromPrivate, // Use derived public key
              },
              endpoints: {},
            };

            newActor = this.actorRepository.create({
              preferredUsername: 'testuser',
              activityPubId: actorId,
              name: 'Test User',
              publicKeyPem: publicKeyPemFromPrivate, // Use derived public key
              privateKeyPem: defaultPrivateKeyPem, // Use the provided or newly generated private key
              data: actorProfile,
              passwordHash: await bcrypt.hash('testpassword', 10),
            });
            await this.actorRepository.save(newActor);

          } else {
            // If no default private key, let AppService generate one
            newActor = await this.createActor('testuser', 'Test User', 'A default test user for development.');
            // Set a default password for the testuser
            const actorToUpdate = await this.actorRepository.findOne({
              where: { preferredUsername: 'testuser' },
            });
            if (actorToUpdate) {
              actorToUpdate.passwordHash = await bcrypt.hash(
                'testpassword',
                10,
              );
              await this.actorRepository.save(actorToUpdate);
            }
          }
          this.logger.log(
            `Default actor "testuser" created successfully with ID: ${newActor.activityPubId}`,
          );
        } catch (createError) {
          this.logger.error(
            `Failed to create default actor "testuser": ${createError.message}`,
            createError.stack,
          );
        }
      } else {
        this.logger.error(
          `Error checking for default actor "testuser": ${error.message}`,
          error.stack,
        );
      }
    }
  }

  /**
   * Handles an incoming ActivityPub activity for a generic relay inbox.
   * This is similar to handleInboxPost but without a specific local actor context initially.
   * @param activity The incoming ActivityPub payload.
   * @param req The Express request object, for rawBody access.
   */
  async handleRelayPost(activity: any, req: any): Promise<void> {
    this.logger.log(
      `Received incoming relay post. Activity Type: '${
        activity.type || 'N/A'
      }', Activity ID: '${activity.id || 'N/A'}'.`,
    );

    // For relay posts, we don't have a specific local actor receiving it directly.
    // The activity's 'to', 'cc', 'bto', 'bcc', 'audience' fields will determine
    // which local actors (if any) are ultimately recipients.
    // For now, we'll store it and let the processor figure out routing.

    // Check for existing activity to prevent duplicates
    if (activity.id) {
      const existingActivity = await this.activityRepository.findOne({
        where: { activityPubId: activity.id },
      });
      if (existingActivity) {
        this.logger.log(
          `Incoming relay activity with ID '${activity.id}' already exists. Skipping storage.`,
        );
        return;
      }
      this.logger.debug(
        `Incoming relay activity has ID: '${activity.id}'. Proceeding with storage.`,
      );
    } else {
      this.logger.warn(
        `Incoming relay activity has no 'id' property. Cannot check for duplicates. Activity: ${JSON.stringify(activity)}`,
      );
    }

    const newActivity = this.activityRepository.create({
      activityPubId: activity.id,
      type: activity.type,
      actorActivityPubId: activity.actor,
      objectActivityPubId: activity.object?.id || activity.object,
      inReplyToActivityPubId: activity.inReplyTo,
      data: activity,
      // Removed rawBody: rawBody.toString('utf8') as ActivityEntity does not have a rawBody column
      // No localActor directly associated here, as it's a generic relay
    });

    await this.activityRepository.save(newActivity);
    this.logger.log(
      `Relay Activity '${activity.id || 'N/A'}' of type '${activity.type || 'N/A'}' stored in database.`,
    );

    // Enqueue for processing. The processor will fan out to local inboxes if applicable.
    await this.inboxQueue.add('processActivity', {
      activityId: newActivity.id,
    });
    this.logger.log(
      `Relay Activity '${activity.id || 'N/A'}' enqueued for inbox processing.`,
    );
  }

  /**
   * Handles an outgoing ActivityPub activity posted by a local client to an outbox.
   * Stores the activity and enqueues it for asynchronous delivery to remote inboxes.
   * @param username The username of the local actor publishing the activity.
   * @param activity The outgoing ActivityPub payload.
   * @param localActorId The ID of the authenticated local actor.
   */
  async handleOutboxPost(
    username: string,
    activity: any,
    localActorId: string,
  ): Promise<void> {
    this.logger.log(
      `Received outgoing outbox post from '${username}'. Activity Type: '${
        activity.type || 'N/A'
      }', Activity ID: '${activity.id || 'N/A'}'.`,
    );

    const localActor = await this.getActorProfile(username); // Using getActorProfile
    if (!localActor || localActor.id !== localActorId) {
      this.logger.warn(
        `Outbox post by unauthorized or non-existent local actor: '${username}'.`,
      );
      throw new NotFoundException(
        `Actor '${username}' not found or unauthorized.`,
      );
    }

    // Ensure the activity has an ID. If not provided by the client, generate one.
    // It's good practice for the server to assign canonical IDs.
    if (!activity.id) {
      activity.id = `${localActor.activityPubId}/activities/${crypto.randomUUID()}`;
      this.logger.debug(
        `Generated ID for outgoing activity: '${activity.id}'.`,
      );
    }

    // Ensure actor property is set correctly for outgoing activities
    if (!activity.actor) {
      activity.actor = localActor.activityPubId;
      this.logger.debug(
        `Set actor for outgoing activity to: '${activity.actor}'.`,
      );
    }

    // For 'Create' activities, ensure the 'object' also has a local ID if it's new content.
    if (activity.type === 'Create' && activity.object && !activity.object.id) {
      activity.object.id = `${localActor.activityPubId}/objects/${crypto.randomUUID()}`;
      this.logger.debug(
        `Generated ID for created object: '${activity.object.id}'.`,
      );
    }

    const newActivity = this.activityRepository.create({
      activityPubId: activity.id,
      type: activity.type,
      actorActivityPubId: localActor.activityPubId,
      objectActivityPubId: activity.object?.id || activity.object,
      inReplyToActivityPubId: activity.inReplyTo,
      data: activity,
      actor: localActor, // Changed from localActor to actor for the relationship
    });

    await this.activityRepository.save(newActivity);
    this.logger.log(
      `Outgoing Activity '${activity.id}' of type '${activity.type}' stored in database for actor '${username}'.`,
    );

    // Enqueue the activity for asynchronous delivery by the OutboxProcessor
    await this.outboxQueue.add('deliverActivity', {
      activityId: newActivity.id,
    });
    this.logger.log(`Activity '${activity.id}' enqueued for outbox delivery.`);
  }

  /**
   * Retrieves the followers collection for a given local actor.
   * @param username The username of the local actor.
   * @param page The page number for pagination.
   * @param perPage The number of items per page.
   * @returns An ActivityPub OrderedCollection representing the followers.
   */
  async getFollowersCollection(
    username: string,
    page: number,
    perPage: number,
  ): Promise<any> {
    this.logger.debug(
      `Fetching followers collection for '${username}', page ${page}, perPage ${perPage}.`,
    );
    const actor = await this.getActorProfile(username); // Using getActorProfile

    // Fetch only 'accepted' followers
    const [follows, totalItems] = await this.followRepository.findAndCount({
      where: {
        followedActivityPubId: actor.activityPubId,
        status: 'accepted', // Only include accepted follows
      },
      skip: (page - 1) * perPage,
      take: perPage,
    });

    this.logger.log(
      `Retrieved ${follows.length} accepted followers for '${username}', total: ${totalItems}.`,
    );

    const items = follows.map((f) => f.followerActivityPubId);
    const collectionId = `${actor.activityPubId}/followers`;

    const { first, last, prev, next } = this.generatePaginationLinks(
      collectionId,
      totalItems,
      page,
      perPage,
    );
    this.logger.debug(
      `Generated pagination links for '${collectionId}': Total items: ${totalItems}, Current page: ${page}, Per page: ${perPage}.`,
    );

    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: collectionId,
      type: 'OrderedCollection',
      totalItems: totalItems,
      first: first,
      last: last,
      ...(prev && { prev }),
      ...(next && { next }),
      orderedItems: items,
    };
  }

  /**
   * Retrieves the following collection for a given local actor.
   * @param username The username of the local actor.
   * @param page The page number for pagination.
   * @param perPage The number of items per page.
   * @returns An ActivityPub OrderedCollection representing who the actor is following.
   */
  async getFollowingCollection(
    username: string,
    page: number,
    perPage: number,
  ): Promise<any> {
    this.logger.debug(
      `Fetching following collection for '${username}', page ${page}, perPage ${perPage}.`,
    );
    const actor = await this.getActorProfile(username); // Using getActorProfile

    // Fetch only 'accepted' following
    const [follows, totalItems] = await this.followRepository.findAndCount({
      where: {
        followerActivityPubId: actor.activityPubId,
        status: 'accepted', // Only include accepted follows
      },
      skip: (page - 1) * perPage,
      take: perPage,
    });

    this.logger.log(
      `Retrieved ${follows.length} accepted following for '${username}', total: ${totalItems}.`,
    );

    const items = follows.map((f) => f.followedActivityPubId);
    const collectionId = `${actor.activityPubId}/following`;

    const { first, last, prev, next } = this.generatePaginationLinks(
      collectionId,
      totalItems,
      page,
      perPage,
    );
    this.logger.debug(
      `Generated pagination links for '${collectionId}': Total items: ${totalItems}, Current page: ${page}, Per page: ${perPage}.`,
    );

    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: collectionId,
      type: 'OrderedCollection',
      totalItems: totalItems,
      first: first,
      last: last,
      ...(prev && { prev }),
      ...(next && { next }),
      orderedItems: items,
    };
  }

  /**
   * Retrieves the outbox collection for a given local actor.
   * @param username The username of the local actor.
   * @param page The page number for pagination.
   * @param perPage The number of items per page.
   * @returns An ActivityPub OrderedCollection representing the outbox activities.
   */
  async getOutboxCollection(
    username: string,
    page: number,
    perPage: number,
  ): Promise<any> {
    this.logger.debug(
      `Fetching outbox collection for '${username}', page ${page}, perPage ${perPage}.`,
    );
    const actor = await this.getActorProfile(username); // Using getActorProfile

    const [activities, totalItems] = await this.activityRepository.findAndCount(
      {
        where: { activityPubId: actor.activityPubId }, // Filter by local actor using the relationship
        order: { createdAt: 'DESC' }, // Order by creation date descending
        skip: (page - 1) * perPage,
        take: perPage,
      },
    );

    this.logger.log(
      `Retrieved ${activities.length} activities for '${username}' outbox, total: ${totalItems}.`,
    );

    const items = activities.map((a) => a.activityPubId);
    const collectionId = `${actor.activityPubId}/outbox`;

    const { first, last, prev, next } = this.generatePaginationLinks(
      collectionId,
      totalItems,
      page,
      perPage,
    );
    this.logger.debug(
      `Generated pagination links for '${collectionId}': Total items: ${totalItems}, Current page: ${page}, Per page: ${perPage}.`,
    );

    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: collectionId,
      type: 'OrderedCollection',
      totalItems: totalItems,
      first: first,
      last: last,
      ...(prev && { prev }),
      ...(next && { next }),
      orderedItems: items,
    };
  }

  /**
   * Retrieves the inbox collection for a given local actor.
   * @param username The username of the local actor.
   * @param page The page number for pagination.
   * @param perPage The number of items per page.
   * @returns An ActivityPub OrderedCollection representing the inbox activities.
   */
  async getInboxCollection(
    username: string,
    page: number,
    perPage: number,
  ): Promise<any> {
    this.logger.debug(
      `Fetching inbox collection for '${username}', page ${page}, perPage ${perPage}.`,
    );
    const actor = await this.getActorProfile(username); // Using getActorProfile

    const [activities, totalItems] = await this.activityRepository.findAndCount(
      {
        where: { actor: { id: actor.id } }, // Filter by local actor using the relationship
        order: { createdAt: 'DESC' }, // Order by creation date descending
        skip: (page - 1) * perPage,
        take: perPage,
      },
    );

    this.logger.log(
      `Retrieved ${activities.length} activities for '${username}' inbox, total: ${totalItems}.`,
    );

    const items = activities.map((a) => a.activityPubId);
    const collectionId = `${actor.activityPubId}/inbox`;

    const { first, last, prev, next } = this.generatePaginationLinks(
      collectionId,
      totalItems,
      page,
      perPage,
    );
    this.logger.debug(
      `Generated pagination links for '${collectionId}': Total items: ${totalItems}, Current page: ${page}, Per page: ${perPage}.`,
    );

    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: collectionId,
      type: 'OrderedCollection',
      totalItems: totalItems,
      first: first,
      last: last,
      ...(prev && { prev }),
      ...(next && { next }),
      orderedItems: items,
    };
  }

  /**
   * Retrieves the liked collection for a given local actor.
   * @param username The username of the local actor.
   * @param page The page number for pagination.
   * @param perPage The number of items per page.
   * @returns An ActivityPub OrderedCollection representing the liked objects.
   */
  async getLikedCollection(
    username: string,
    page: number,
    perPage: number,
  ): Promise<any> {
    this.logger.debug(
      `Fetching liked collection for '${username}', page ${page}, perPage ${perPage}.`,
    );
    const actor = await this.getActorProfile(username); // Using getActorProfile

    const [likes, totalItems] = await this.likeRepository.findAndCount({
      where: { likerActivityPubId: actor.activityPubId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });

    this.logger.log(
      `Retrieved ${likes.length} liked objects for '${username}', total: ${totalItems}.`,
    );

    const items = likes.map((l) => l.likedObjectActivityPubId);
    const collectionId = `${actor.activityPubId}/liked`;

    const { first, last, prev, next } = this.generatePaginationLinks(
      collectionId,
      totalItems,
      page,
      perPage,
    );
    this.logger.debug(
      `Generated pagination links for '${collectionId}': Total items: ${totalItems}, Current page: ${page}, Per page: ${perPage}.`,
    );

    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: collectionId,
      type: 'OrderedCollection',
      totalItems: totalItems,
      first: first,
      last: last,
      ...(prev && { prev }),
      ...(next && { next }),
      orderedItems: items,
    };
  }

  /**
   * Generates pagination links for ActivityPub collections.
   * @param collectionId The base ID of the collection.
   * @param totalItems The total number of items in the collection.
   * @param currentPage The current page number (1-indexed).
   * @param perPage The number of items per page.
   * @returns An object containing `first`, `last`, `prev`, and `next` page links.
   */
  private generatePaginationLinks(
    collectionId: string,
    totalItems: number,
    currentPage: number,
    perPage: number,
  ) {
    const totalPages = Math.ceil(totalItems / perPage);

    const firstPage = `${collectionId}?page=1&perPage=${perPage}`;
    const lastPage = `${collectionId}?page=${totalPages}&perPage=${perPage}`;

    let prevPage: string | undefined = undefined;
    if (currentPage > 1) {
      prevPage = `${collectionId}?page=${currentPage - 1}&perPage=${perPage}`;
    }

    let nextPage: string | undefined = undefined;
    if (currentPage < totalPages) {
      nextPage = `${collectionId}?page=${currentPage + 1}&perPage=${perPage}`;
    }

    return {
      first: firstPage,
      last: lastPage,
      prev: prevPage,
      next: nextPage,
    };
  }

  /**
   * Retrieves a content object by its ActivityPub ID.
   * Delegates to RemoteObjectService for fetching local or remote objects.
   * @param objectId The ActivityPub ID (URI) of the content object.
   * @returns The content object's JSON-LD payload, or null if not found.
   */
  async getContentObject(objectId: string): Promise<any | null> {
    this.logger.debug(`Fetching content object: '${objectId}' via AppService.`);
    return this.remoteObjectService.fetchRemoteObject(objectId);
  }
  
  public getInstanceBaseUrl() {
    return this.instanceBaseUrl;
  }

  /**
   * Retrieves a activity object by its ActivityPub ID.
   * @param activityPubId The ActivityPub ID (URI) of the activity object.
   * @returns The activity object's JSON-LD payload, or null if not found.
   */
  async getLocalContentObject(activityPubId: string): Promise<any | null> {
    this.logger.debug(`Fetching local content object: '${activityPubId}' via AppService.`);
    // You should fetch from your local database first, then potentially remote if not found
    const localActivity = await this.contentObjectRepository.findOne({ where: { activityPubId: activityPubId } }); // Corrected: Query by activityPubId column
    if (localActivity) {
      return localActivity.data; // Return the stored JSON-LD data
    }
    // If not found locally, you might attempt to fetch remotely via remoteObjectService
    // return this.remoteObjectService.fetchRemoteObject(activityPubId);
    return null; // For now, just return null if not local
  }

  /**
   * Retrieves a activity object by its ActivityPub ID.
   * @param activityPubId The ActivityPub ID (URI) of the activity object.
   * @returns The activity object's JSON-LD payload, or null if not found.
   */
  async getActivityObject(activityPubId: string): Promise<any | null> {
    this.logger.debug(`Fetching activity object: '${activityPubId}' via AppService.`);
    // You should fetch from your local database first, then potentially remote if not found
    const localActivity = await this.activityRepository.findOne({ where: { activityPubId: activityPubId } }); // Corrected: Query by activityPubId column
    if (localActivity) {
      return localActivity.data; // Return the stored JSON-LD data
    }
    // If not found locally, you might attempt to fetch remotely via remoteObjectService
    // return this.remoteObjectService.fetchRemoteObject(activityPubId);
    return null; // For now, just return null if not local
  }

  /**
   * Retrieves a public timeline of content objects.
   * @param page The page number for pagination.
   * @param perPage The number of items per page.
   * @returns An ActivityPub OrderedCollection representing the public timeline.
   */
  async getPublicTimeline(page: number, perPage: number): Promise<any> {
    this.logger.debug(
      `Fetching public timeline, page ${page}, perPage ${perPage}.`,
    );

    const [contentObjects, totalItems] =
      await this.contentObjectRepository.findAndCount({
        where: {
          type: 'Note', // Filter for 'Note' type, assuming public posts are notes
          inReplyToActivityPubId: IsNull(), // Exclude replies for a "main" timeline
        },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * perPage,
        take: perPage,
      });

    this.logger.log(
      `Retrieved ${contentObjects.length} public timeline items, total: ${totalItems}.`,
    );

    const items = contentObjects.map((obj) => obj.activityPubId);
    const collectionId = `${this.instanceBaseUrl}/public`;

    const { first, last, prev, next } = this.generatePaginationLinks(
      collectionId,
      totalItems,
      page,
      perPage,
    );

    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: collectionId,
      type: 'OrderedCollection',
      totalItems: totalItems,
      first: first,
      last: last,
      ...(prev && { prev }),
      ...(next && { next }),
      orderedItems: items,
    };
  }

  /**
   * Generates WebFinger response for a given resource.
   * @param resource The WebFinger resource string (e.g., 'acct:username@domain.com').
   * @returns The WebFinger JSON response.
   * @throws BadRequestException if the resource format is invalid.
   * @throws NotFoundException if the resource is not found on this instance.
   */
  async getWebfinger(resource: string): Promise<any> {
    this.logger.debug(`Generates WebFinger for resource: '${resource}'.`);
    const usernameMatch = resource.match(/^acct:([^@]+)@(.+)$/);
    if (!usernameMatch) {
      throw new BadRequestException('Invalid WebFinger resource format.');
    }
    const username = usernameMatch[1];
    const domain = usernameMatch[2];

    if (domain !== new URL(this.instanceBaseUrl).hostname) {
      throw new NotFoundException(
        `Resource not found on this domain: ${domain}`,
      );
    }

    const actor = await this.getActorProfile(username); // Reusing existing method

    return {
      subject: resource,
      aliases: [actor.activityPubId],
      links: [
        {
          rel: 'self',
          type: 'application/activity+json',
          href: actor.activityPubId,
        },
        {
          rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0',
          href: `${this.instanceBaseUrl}/nodeinfo/2.0`,
        },
        {
          rel: 'http://webfinger.net/rel/profile-page',
          type: 'text/html',
          href: `${this.instanceBaseUrl}/@${username}`, // Example profile page URL
        },
      ],
    };
  }

  /**
   * Signs an outgoing HTTP request with an HTTP Signature.
   * This is crucial for server-to-server communication in ActivityPub.
   * @param actor The local actor sending the request (containing private key).
   * @param url The URL the request is being sent to.
   * @param method The HTTP method (e.g., 'POST', 'GET').
   * @param body The request body as a string (for Digest calculation).
   * @returns An object containing the Date header, Digest header, and Signature header.
   * @throws Error if signing fails (e.g., missing private key).
   */
  signActivity(
    actor: ActorEntity,
    url: string,
    method: string,
    body: string,
  ): { date: string; digest: string; signatureHeader: string } {
    this.logger.debug(
      `Signing outgoing activity for actor '${actor.activityPubId}' to URL: '${url}'.`,
    );

    if (!actor.privateKeyPem) {
      throw new Error(
        `Actor '${actor.activityPubId}' does not have a private key for signing.`,
      );
    }

    const date = new Date().toUTCString();
    const digest = `SHA-256=${createHash('sha256').update(body).digest('base64')}`;

    // The (request-target) pseudo-header is `method.toLowerCase() + ' ' + path`
    const urlObj = new URL(url);
    const requestTarget = `${method.toLowerCase()} ${urlObj.pathname}${urlObj.search}`;

    // Headers to be included in the signature string. Order matters.
    // Mastodon typically expects: (request-target), host, date, digest, content-type
    const headersToSign = [
      '(request-target)',
      'host',
      'date',
      'digest',
      'content-type',
    ];

    const signingString = headersToSign
      .map((header) => {
        if (header === '(request-target)') {
          return `${header}: ${requestTarget}`;
        }
        if (header === 'host') {
          return `${header}: ${urlObj.hostname}`;
        }
        if (header === 'date') {
          return `${header}: ${date}`;
        }
        if (header === 'digest') {
          return `${header}: ${digest}`;
        }
        if (header === 'content-type') {
          return `${header}: application/activity+json`; // Always for ActivityPub posts
        }
        return ''; // Should not happen with defined headers
      })
      .join('\n');

    this.logger.debug(`Signing string: \n${signingString}`);

    const signer = createSign('RSA-SHA256'); // Algorithm for signing
    signer.update(signingString);
    const signature = signer.sign(actor.privateKeyPem, 'base64');

    const signatureHeader = `keyId="${actor.activityPubId}#main-key",headers="${headersToSign.join(' ')}",signature="${signature}"`;

    this.logger.debug(
      `Generated Signature header: ${signatureHeader.substring(0, 100)}...`,
    ); // Log truncated signature
    return { date, digest, signatureHeader };
  }

  /**
   * Verifies an incoming HTTP Signature.
   * @param signatureHeader The full 'Signature' header value from the request.
   * @param requestTarget The '(request-target)' pseudo-header value derived from the incoming request.
   * @param host The 'Host' header value from the request.
   * @param dateHeader The 'Date' header value from the request.
   * @param digestHeader The 'Digest' header value from the request.
   * @param contentTypeHeader The 'Content-Type' header value from the request.
   * @param rawBody The raw request body as a Buffer.
   * @returns True if the signature is valid, false otherwise.
   * @throws InvalidSignatureException on verification failure.
   */
  async verifyHttpSignature(
    signatureHeader: string,
    requestTarget: string,
    host: string,
    dateHeader: string,
    digestHeader: string,
    contentTypeHeader: string,
    rawBody: Buffer,
  ): Promise<boolean> {
    this.logger.debug(`Attempting HTTP Signature verification.`);

    // 1. Parse the Signature header
    const signatureParams: { [key: string]: string } = {};
    signatureHeader.split(',').forEach((param) => {
      const parts = param.trim().split('=');
      if (parts.length === 2) {
        signatureParams[parts[0]] = parts[1].replace(/"/g, '');
      }
    });

    const keyId = signatureParams.keyId;
    const algorithm = signatureParams.algorithm;
    const signedHeaders = signatureParams.headers?.split(' ');
    const signature = signatureParams.signature;

    if (!keyId || !algorithm || !signedHeaders || !signature) {
      this.logger.warn(
        `Missing required signature parameters in header: ${signatureHeader}`,
      );
      throw new InvalidSignatureException(
        'Missing required signature parameters.',
      );
    }

    this.logger.debug(
      `Parsed Signature: keyId=${keyId}, algorithm=${algorithm}, headers=${signedHeaders.join(' ')}`,
    );

    // 2. Validate Date header (optional, but good practice for replay attacks)
    const requestDate = new Date(dateHeader);
    const now = new Date();
    const clockSkewToleranceMs = 5 * 60 * 1000; // 5 minutes
    if (
      Math.abs(now.getTime() - requestDate.getTime()) > clockSkewToleranceMs
    ) {
      this.logger.warn(
        `Date header '${dateHeader}' is outside acceptable clock skew.`,
      );
      // For now, we'll log a warning but still attempt verification.
      // In a strict production environment, this might be an immediate rejection.
    } else {
      this.logger.debug(
        `Date header '${dateHeader}' is within acceptable range.`,
      );
    }

    // 3. Verify Digest header
    const calculatedDigest = `SHA-256=${createHash('sha256').update(rawBody).digest('base64')}`;
    if (calculatedDigest !== digestHeader) {
      this.logger.warn(
        `Digest mismatch. Calculated: '${calculatedDigest}', Received: '${digestHeader}'. Raw Body: ${rawBody.toString('utf8')}`,
      );
      throw new InvalidSignatureException('Digest mismatch.');
    }
    this.logger.debug(
      `Digest verified successfully. Calculated: '${calculatedDigest}'.`,
    );

    // 4. Construct the signing string
    const signingString = signedHeaders
      .map((header) => {
        if (header === '(request-target)') {
          return `${header}: ${requestTarget}`;
        }
        if (header === 'host') {
          return `${header}: ${host}`;
        }
        if (header === 'date') {
          return `${header}: ${dateHeader}`;
        }
        if (header === 'digest') {
          return `${header}: ${digestHeader}`;
        }
        if (header === 'content-type') {
          return `${header}: ${contentTypeHeader}`;
        }
        // For any other custom headers included in 'headers' parameter,
        // you would need to retrieve their values from the request headers.
        // For ActivityPub, the above set is usually sufficient.
        return '';
      })
      .join('\n');

    this.logger.debug(`Constructed Signing String: \n${signingString}`);

    // 5. Retrieve the public key
    const publicKeyPem = await this.remoteObjectService.fetchPublicKey(keyId);
    if (!publicKeyPem) {
      this.logger.warn(
        `Public key for keyId '${keyId}' not found or could not be fetched.`,
      );
      throw new InvalidSignatureException(
        `Public key for keyId '${keyId}' not found.`,
      );
    }
    this.logger.debug(`Public key PEM fetched for keyId: ${keyId}`);

    // 6. Verify the signature
    try {
      const verifier = createVerify('RSA-SHA256'); // Assuming RSA-SHA256 as per Mastodon
      verifier.update(signingString);
      const isValid = verifier.verify(publicKeyPem, signature, 'base64');

      if (!isValid) {
        this.logger.warn(
          `HTTP Signature verification failed for keyId: '${keyId}'.`,
        );
        throw new InvalidSignatureException(
          'HTTP Signature verification failed.',
        );
      }

      this.logger.debug(
        `HTTP Signature verified successfully for keyId: '${keyId}'.`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Error during signature verification for keyId '${keyId}': ${error.message}.`,
        error.stack,
      );
      throw new InvalidSignatureException(
        `Signature verification failed: ${error.message}`,
      );
    }
  }

  /**
   * Retrieves NodeInfo 2.0 metadata for the instance.
   * @returns NodeInfo 2.0 object.
   */
  async getNodeInfo2(): Promise<any> {
    this.logger.debug('Generating NodeInfo 2.0.');
    return {
      version: '2.0',
      server: {
        domain: new URL(this.instanceBaseUrl).hostname,
        // Other server metadata like software, version, etc.
        software: {
          name: 'EducationPub',
          version: '0.1.0', // Your application version
          repository: 'https://github.com/ActivityEducation/backend',
          homepage: 'https://social.bleauweb.org',
        },
        // Optional: usage statistics, open registration, etc.
        usage: {
          users: {
            total: await this.actorRepository.count(),
            activeMonth: 0, // Implement active user logic if needed
            activeHalfyear: 0,
          },
          localPosts: await this.contentObjectRepository.count({
            where: { attributedToActivityPubId: Not(IsNull()) },
          }), // Count local posts
          // sharedInboxUrl: `${this.instanceBaseUrl}/inbox`, // Advertise shared inbox here
        },
        // Optional: metadata, protocols, etc.
        metadata: {
          nodeName: 'BleauWeb Social',
          nodeDescription:
            'A minimal ActivityPub server for learning and experimentation.',
          // Any other custom metadata
        },
      },
      protocols: ['activitypub', 'educationpub'], // List supported protocols
      // Optional: services, usage, etc.
      openRegistrations: false, // Set to true if open for new user registrations
      usage: {
        users: {
          total: await this.actorRepository.count(),
          activeMonth: 0,
          activeHalfyear: 0,
        },
        localPosts: await this.contentObjectRepository.count(),
        sharedInboxUrl: `${this.instanceBaseUrl}/inbox`, // Advertise shared inbox here
      },
      // Other NodeInfo 2.0 properties as per spec
      // https://nodeinfo.diaspora.software/ns/schema/2.0
    };
  }

  /**
   * Retrieves NodeInfo 1.0 metadata for the instance.
   * @returns NodeInfo 1.0 object.
   */
  async getNodeInfo1(): Promise<any> {
    this.logger.debug('Generating NodeInfo 1.0.');
    return {
      version: '1.0',
      // NodeInfo 1.0 typically just points to the 2.0 schema
      links: [
        {
          rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0', // Link to the NodeInfo 2.0 schema
          href: `${this.instanceBaseUrl}/nodeinfo/2.0`, // URL of the NodeInfo 2.0 endpoint
        },
      ],
    };
  }

  /**
   * Resolves a remote actor's inbox URL from their ActivityPub profile,
   * with Redis caching.
   * @param actorId The ActivityPub URI of the remote actor.
   * @returns The inbox URL as a string, or null if not found/resolvable.
   */
  async getRemoteActorInbox(actorId: string): Promise<string | null> {
    const cacheKey = `actorInbox:${actorId}`;
    const cachedUrl = await this.redisClient.get(cacheKey);
    if (cachedUrl) {
      this.logger.debug(`Actor inbox for '${actorId}' found in Redis cache.`);
      return cachedUrl;
    }

    const MAX_RETRIES = 3;
    let retries = 0;
    while (retries < MAX_RETRIES) {
      try {
        this.logger.debug(
          `Resolving remote actor inbox for: '${actorId}' (Attempt ${retries + 1}/${MAX_RETRIES}).`,
        );
        const response = await fetch(actorId, {
          headers: { Accept: 'application/activity+json, application/ld+json' },
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Failed to fetch remote actor profile '${actorId}': ${response.status} ${response.statusText} - ${errorText}`,
          );
        }
        const actorProfile = await response.json();

        let inboxUrl: string | null = null;
        if (actorProfile.endpoints?.sharedInbox) {
          inboxUrl = String(actorProfile.endpoints.sharedInbox);
          this.logger.log(
            `Resolved sharedInbox for '${actorId}': '${inboxUrl}'.`,
          );
        } else if (actorProfile.inbox) {
          inboxUrl = String(actorProfile.inbox);
          this.logger.log(
            `Resolved individual inbox for '${actorId}': '${inboxUrl}'.`,
          );
        } else {
          this.logger.warn(
            `Remote actor '${actorId}' profile has no inbox or sharedInbox property. Cannot determine inbox URL.`,
          );
        }

        if (inboxUrl) {
          await this.redisClient.set(cacheKey, inboxUrl, 'EX', 60 * 60 * 24); // Cache for 24 hours
          return inboxUrl;
        }
        return null;
      } catch (error) {
        this.logger.error(
          `Error resolving remote actor inbox for '${actorId}' (Attempt ${retries + 1}): ${error.message}.`,
          error.stack,
        );
        retries++;
        if (retries < MAX_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * Math.pow(2, retries - 1)),
          );
        }
      }
    }
    this.logger.error(
      `Failed to resolve remote actor inbox after ${MAX_RETRIES} attempts: '${actorId}'.`,
    );
    await this.redisClient.set(cacheKey, 'null', 'EX', 60 * 60); // Cache null for 1 hour to avoid repeated failed lookups
    return null;
  }

  /**
   * Helper to fetch a domain's shared inbox URL, with Redis caching.
   * Prioritizes sharedInbox from NodeInfo 2.0 or well-known endpoints.
   * @param domain The domain of the remote instance (e.g., 'mastodon.social').
   * @returns The shared inbox URL as a string, or null if not found.
   */
  async getDomainSharedInbox(domain: string): Promise<string | null> {
    const cacheKey = `sharedInbox:${domain}`;
    const cachedUrl = await this.redisClient.get(cacheKey);
    if (cachedUrl) {
      this.logger.debug(`Shared inbox for '${domain}' found in Redis cache.`);
      return cachedUrl === 'null' ? null : cachedUrl; // Handle cached 'null' string
    }

    const MAX_RETRIES = 2;
    let retries = 0;
    while (retries < MAX_RETRIES) {
      try {
        let sharedInboxUrl: string | null = null;

        // 1. Try to fetch NodeInfo 2.0 directly
        const nodeinfo2Url = `https://${domain}/nodeinfo/2.0`;
        this.logger.debug(
          `Attempting to fetch NodeInfo 2.0 from '${nodeinfo2Url}' (Attempt ${retries + 1}/${MAX_RETRIES}).`,
        );
        const nodeinfo2Response = await fetch(nodeinfo2Url, {
          headers: { Accept: 'application/json' },
        });

        if (nodeinfo2Response.ok) {
          const nodeinfo2 = await nodeinfo2Response.json();
          if (
            nodeinfo2.protocols?.includes('activitypub') &&
            nodeinfo2.usage?.sharedInboxUrl
          ) {
            sharedInboxUrl = String(nodeinfo2.usage.sharedInboxUrl);
            this.logger.log(
              `Found shared inbox for '${domain}' via NodeInfo 2.0: '${sharedInboxUrl}'.`,
            );
          }
        } else {
          this.logger.warn(
            `NodeInfo 2.0 failed for '${domain}': ${nodeinfo2Response.status} ${nodeinfo2Response.statusText}.`,
          );
        }

        // If not found via direct NodeInfo 2.0, try well-known NodeInfo discovery
        if (!sharedInboxUrl) {
          const wellKnownNodeinfoUrl = `https://${domain}/.well-known/nodeinfo`;
          this.logger.debug(
            `Attempting to fetch .well-known/nodeinfo from '${wellKnownNodeinfoUrl}' (Attempt ${retries + 1}/${MAX_RETRIES}).`,
          );
          const wellKnownNodeinfoResponse = await fetch(wellKnownNodeinfoUrl, {
            headers: { Accept: 'application/json' },
          });

          if (wellKnownNodeinfoResponse.ok) {
            const wellKnownNodeinfo = await wellKnownNodeinfoResponse.json();
            const nodeinfo2Link = wellKnownNodeinfo.links?.find(
              (link) =>
                link.rel === 'http://nodeinfo.diaspora.software/ns/schema/2.0',
            );
            if (nodeinfo2Link?.href) {
              this.logger.debug(
                `Found NodeInfo 2.0 link via .well-known/nodeinfo: '${nodeinfo2Link.href}'.`,
              );
              const directNodeinfo2Response = await fetch(
                String(nodeinfo2Link.href),
                {
                  headers: { Accept: 'application/json' },
                },
              );
              if (directNodeinfo2Response.ok) {
                const directNodeinfo2 = await directNodeinfo2Response.json();
                if (
                  directNodeinfo2.protocols?.includes('activitypub') &&
                  directNodeinfo2.usage?.sharedInboxUrl
                ) {
                  sharedInboxUrl = String(directNodeinfo2.usage.sharedInboxUrl);
                  this.logger.log(
                    `Found shared inbox for '${domain}' via .well-known/nodeinfo -> NodeInfo 2.0: '${sharedInboxUrl}'.`,
                  );
                }
              } else {
                this.logger.warn(
                  `Direct NodeInfo 2.0 fetch failed from link '${nodeinfo2Link.href}': ${directNodeinfo2Response.status} ${directNodeinfo2Response.statusText}.`,
                );
              }
            }
          } else {
            this.logger.warn(
              `.well-known/nodeinfo failed for '${domain}': ${wellKnownNodeinfoResponse.status} ${wellKnownNodeinfoResponse.statusText}.`,
            );
          }
        }

        if (sharedInboxUrl) {
          await this.redisClient.set(
            cacheKey,
            sharedInboxUrl,
            'EX',
            60 * 60 * 24,
          ); // Cache for 24 hours
          return sharedInboxUrl;
        } else {
          this.logger.log(
            `No shared inbox found for domain '${domain}' after all attempts.`,
          );
          await this.redisClient.set(cacheKey, 'null', 'EX', 60 * 60); // Cache null for 1 hour to avoid repeated failed lookups
          return null;
        }
      } catch (error) {
        this.logger.error(
          `Error discovering shared inbox for '${domain}' (Attempt ${retries + 1}): ${error.message}.`,
          error.stack,
        );
        retries++;
        if (retries < MAX_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * Math.pow(2, retries - 1)),
          );
        }
      }
    }
    this.logger.error(
      `Failed to discover shared inbox for '${domain}' after ${MAX_RETRIES} attempts.`,
    );
    await this.redisClient.set(cacheKey, 'null', 'EX', 60 * 60); // Cache null even after retries fail
    return null;
  }
}
