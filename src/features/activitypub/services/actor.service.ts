// src/features/activitypub/services/actor.service.ts

import { Injectable, ConflictException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorEntity } from '../entities/actor.entity';
import { UserEntity } from '../../auth/entities/user.entity';
import { ConfigService } from '@nestjs/config';
import { RemoteObjectService } from 'src/core/services/remote-object.service'; // Import RemoteObjectService for fetching remote actor profiles
import { KeyManagementService } from 'src/core/services/key-management.service';
import { LoggerService } from 'src/shared/services/logger.service';
import { normalizeUrl } from 'src/shared/utils/url-normalizer';

/**
 * Service for managing ActivityPub Actors, including creation, retrieval,
 * and ensuring their public/private keys are handled.
 */
@Injectable()
export class ActorService {
  private readonly instanceBaseUrl: string;

  constructor(
    @InjectRepository(ActorEntity)
    private readonly actorRepository: Repository<ActorEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly keyManagementService: KeyManagementService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly remoteObjectService: RemoteObjectService, // Inject RemoteObjectService
  ) {
    this.logger.setContext('ActorService');
    const baseUrl = this.configService.get<string>('INSTANCE_BASE_URL');
    if (!baseUrl) {
      this.logger.error('INSTANCE_BASE_URL is not defined in environment variables.');
      throw new Error('INSTANCE_BASE_URL is not defined.');
    }
    this.instanceBaseUrl = baseUrl;
  }

  /**
   * Creates a new ActivityPub Actor associated with a local user.
   * This involves generating a key pair, constructing the actor's ActivityPub ID,
   * and saving the actor to the database.
   *
   * @param user The UserEntity for whom the actor is being created.
   * @param preferredUsername The desired username for the actor.
   * @param name Optional display name for the actor.
   * @param summary Optional summary/bio for the actor.
   * @returns The newly created ActorEntity.
   * @throws ConflictException if the preferred username already exists.
   * @throws InternalServerErrorException if key generation or saving fails.
   */
  async createLocalActor(
    user: UserEntity,
    preferredUsername: string,
    name?: string,
    summary?: string,
  ): Promise<ActorEntity> {
    this.logger.log(`Attempting to create local actor for user: ${user.username}`);

    const existingActor = await this.actorRepository.findOne({ where: { preferredUsername } });
    if (existingActor) {
      throw new ConflictException(`Actor with username '${preferredUsername}' already exists.`);
    }

    const { publicKeyPem, privateKeyPem } = await this.keyManagementService.generateKeyPair();

    const actorId = `${this.instanceBaseUrl}/actors/${preferredUsername}`;
    const inboxUrl = `${actorId}/inbox`;
    const outboxUrl = `${actorId}/outbox`;
    const followersUrl = `${actorId}/followers`;
    const followingUrl = `${actorId}/following`;
    const likedUrl = `${actorId}/liked`;

    const newActor = this.actorRepository.create({
      preferredUsername,
      activityPubId: actorId,
      name: name || preferredUsername,
      summary,
      inbox: inboxUrl,
      outbox: outboxUrl,
      followersUrl: followersUrl,
      followingUrl: followingUrl,
      likedUrl: likedUrl,
      publicKeyPem,
      privateKeyPem, // Stored here temporarily for MVP, should be in KMS
      isLocal: true,
      user: user, // Link to the user entity
    });

    try {
      const savedActor = await this.actorRepository.save(newActor);
      this.logger.log(`Local actor created: ${savedActor.preferredUsername} (${savedActor.activityPubId})`);

      // For development, you might also store the private key locally as a file
      // await this.keyManagementService.storePrivateKeyLocally(savedActor.id, privateKeyPem);

      // Link actor back to user (bi-directional relationship)
      user.actor = savedActor;
      await this.userRepository.save(user);

      return savedActor;
    } catch (error) {
      this.logger.error(`Failed to save new actor: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to create actor: ${error.message}`);
    }
  }

  /**
   * Public method to create an ActivityPub Actor for an existing user.
   * This method fetches the user by ID and then calls the internal createLocalActor.
   *
   * @param userId The internal database ID of the user.
   * @param preferredUsername The desired username for the actor.
   * @param name Optional display name for the actor.
   * @param summary Optional summary/bio for the actor.
   * @returns The newly created ActorEntity.
   * @throws NotFoundException if the user is not found.
   * @throws ConflictException if the preferred username already exists.
   * @throws InternalServerErrorException if key generation or saving fails.
   */
  async createActorForUser(
    userId: string,
    preferredUsername: string,
    name?: string,
    summary?: string,
  ): Promise<ActorEntity> {
    this.logger.log(`Attempting to create actor for user ID: ${userId} with username: ${preferredUsername}`);
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID '${userId}' not found.`);
    }

    if (user.actor) {
        throw new ConflictException(`User with ID '${userId}' already has an associated actor.`);
    }

    return this.createLocalActor(user, preferredUsername, name, summary);
  }

  /**
   * Finds an actor (local or remote) by their ActivityPub ID.
   * If the actor is not found locally, it attempts to fetch and store them remotely.
   *
   * @param activityPubId The ActivityPub URI of the actor.
   * @returns The ActorEntity.
   * @throws NotFoundException if the actor cannot be found locally or remotely.
   */
  async findActorByActivityPubId(activityPubId: string): Promise<ActorEntity> {
    const normalizedId = normalizeUrl(activityPubId);
    this.logger.debug(`Searching for actor by ActivityPub ID: ${normalizedId}`);

    let actor = await this.actorRepository.findOne({ where: { activityPubId: normalizedId } });

    if (!actor) {
      this.logger.log(`Actor '${normalizedId}' not found locally, attempting to fetch remotely.`);
      // Use RemoteObjectService to fetch and store the remote actor
      const remoteActor = await this.remoteObjectService.fetchAndStoreRemoteObject(normalizedId);
      if (remoteActor instanceof ActorEntity) {
        actor = remoteActor;
      } else if (remoteActor === null) {
        throw new NotFoundException(`Actor '${normalizedId}' could not be fetched remotely.`);
      } else {
        // This case indicates the remote object was not an actor type, but some other content object.
        // This should ideally be handled by specific error or by refining fetchAndStoreRemoteObject return types.
        throw new NotFoundException(`Object at '${normalizedId}' is not an Actor.`);
      }
    }
    return actor;
  }

  /**
   * Finds a local actor by their preferred username.
   *
   * @param preferredUsername The preferred username of the local actor.
   * @returns The ActorEntity if found.
   * @throws NotFoundException if no local actor with the given username exists.
   */
  async findLocalActorByUsername(preferredUsername: string): Promise<ActorEntity> {
    this.logger.debug(`Searching for local actor by username: ${preferredUsername}`);
    const actor = await this.actorRepository.findOne({ where: { preferredUsername, isLocal: true } });
    if (!actor) {
      throw new NotFoundException(`Local actor with username '${preferredUsername}' not found.`);
    }
    return actor;
  }

  /**
   * Finds a local actor by their preferred username.
   *
   * @param userId The preferred username of the local actor.
   * @returns The ActorEntity if found.
   * @throws NotFoundException if no local actor with the given username exists.
   */
  async findActorForUser(userId: string): Promise<ActorEntity> {
    this.logger.debug(`Searching for local actor by id: ${userId}`);
    const actor = await this.actorRepository.findOne({ where: { id: userId, isLocal: true } });
    if (!actor) {
      throw new NotFoundException(`Local actor with id '${userId}' not found.`);
    }
    return actor;
  }

  /**
   * Finds an actor (local or cached remote) by their preferred username.
   * This method performs a lookup based on the preferredUsername column in the database.
   *
   * @param username The preferred username of the actor.
   * @returns The ActorEntity if found.
   * @throws NotFoundException if no actor with the given username exists in the local database.
   */
  async findActorByPreferredUsername(username: string): Promise<ActorEntity> {
    this.logger.debug(`Searching for actor by preferred username: ${username}`);
    const actor = await this.actorRepository.findOne({ where: { preferredUsername: username } });
    if (!actor) {
      throw new NotFoundException(`Actor with preferred username '${username}' not found.`);
    }
    return actor;
  }

  /**
   * Finds an actor by their internal database ID.
   *
   * @param id The internal UUID of the actor.
   * @returns The ActorEntity if found.
   * @throws NotFoundException if no actor with the given ID exists.
   */
  async findActorById(id: string): Promise<ActorEntity> {
    this.logger.debug(`Searching for actor by ID: ${id}`);
    const actor = await this.actorRepository.findOne({ where: { id } });
    if (!actor) {
      throw new NotFoundException(`Actor with ID '${id}' not found.`);
    }
    return actor;
  }

  /**
   * Retrieves an actor's ActivityPub profile data (JSON-LD).
   * Used for serving the /actors/:username endpoint.
   *
   * @param username The preferred username of the actor.
   * @returns The ActivityPub profile object.
   * @throws NotFoundException if the actor is not found.
   */
  async getActorProfile(username: string): Promise<any> {
    this.logger.debug(`Getting ActivityPub profile for username: ${username}`);
    const actor = await this.findLocalActorByUsername(username);

    if (!actor) {
      throw new NotFoundException(`Actor with username '${username}' not found.`);
    }

    // Construct the ActivityPub profile object based on the ActorEntity data
    const actorProfile = {
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        'https://w3id.org/security/v1',
      ],
      id: actor.activityPubId,
      type: 'Person', // Or other appropriate Actor type
      preferredUsername: actor.preferredUsername,
      name: actor.name,
      summary: actor.summary,
      inbox: actor.inbox,
      outbox: actor.outbox,
      followers: actor.followersUrl, // This will be the URL to the collection
      following: actor.followingUrl, // This will be the URL to the collection
      liked: actor.likedUrl,       // This will be the URL to the collection
      publicKey: {
        id: `${actor.activityPubId}#main-key`,
        owner: actor.activityPubId,
        publicKeyPem: actor.publicKeyPem,
      },
    };

    // Store the full profile as JSONB on the actor entity if it's not already there or needs updating
    if (JSON.stringify(actor.data) !== JSON.stringify(actorProfile)) {
      actor.data = actorProfile;
      await this.actorRepository.save(actor);
    }

    return actorProfile;
  }
}
