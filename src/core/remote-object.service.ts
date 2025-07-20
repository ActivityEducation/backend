import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm'; // For injecting TypeORM repositories
import { Repository, IsNull } from 'typeorm'; // TypeORM Repository type and IsNull for soft delete checks
import { Redis } from 'ioredis'; // Import Redis type
import { ContentObjectEntity } from '../features/activitypub/entities/content-object.entity';
import { CustomLogger } from './custom-logger.service';

@Injectable()
export class RemoteObjectService {
  constructor(
    @InjectRepository(ContentObjectEntity)
    private readonly contentObjectRepository: Repository<ContentObjectEntity>, // Repository for ContentObjectEntity
    private readonly logger: CustomLogger, // Custom logger
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis, // Inject Redis client
  ) {
    this.logger.setContext('RemoteObjectService'); // Set context for the logger
  }

  /**
   * Fetches a remote ActivityPub object by its ID (URI) from the network.
   * Includes retry logic with exponential backoff and caching.
   * This is used when an ActivityPub instance needs to retrieve content from another instance.
   * @param objectId The ActivityPub URI of the remote object.
   * @returns The fetched object's JSON-LD payload, or null if not found/resolvable.
   */
  async fetchRemoteObject(objectId: string): Promise<any | null> {
    this.logger.debug(`Attempting to fetch remote object: '${objectId}'.`);

    // 1. Check local in-memory cache first to reduce network requests.
    // NOTE: This in-memory cache is for demonstration. In production, use Redis.
    // For this app, we're transitioning to Redis for all caching, so this can be removed later.
    // For now, it's kept as a quick check before hitting Redis/DB for general objects.
    // Public keys will use Redis directly.
    // if (remoteObjectCache.has(objectId)) { // Removed in-memory cache
    //   this.logger.debug(`Remote object for '${objectId}' found in in-memory cache.`);
    //   return remoteObjectCache.get(objectId);
    // }

    // 2. Check local database: If it's an object that we've already stored (e.g., a local post,
    // or a remote object we've previously fetched and stored), retrieve it from here.
    const localContentObject = await this.contentObjectRepository.findOne({
      where: { activityPubId: objectId, deletedAt: IsNull() }, // Ensure it's not soft-deleted
    });
    if (localContentObject) {
      this.logger.debug(`Remote object for '${objectId}' found locally.`);
      // remoteObjectCache.set(objectId, localContentObject.data); // Removed in-memory cache
      return localContentObject.data;
    }

    // 3. For truly remote objects not found locally, attempt to fetch from the objectId URL with retry logic.
    const MAX_RETRIES = 3;
    let retries = 0;
    while (retries < MAX_RETRIES) {
      try {
        this.logger.log(`Fetching remote object from: '${objectId}' (Attempt ${retries + 1}/${MAX_RETRIES}).`);
        const response = await fetch(objectId, {
          headers: { Accept: 'application/activity+json, application/ld+json' }, // Request ActivityPub JSON-LD
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch remote object '${objectId}': ${response.status} ${response.statusText} - ${errorText}`);
        }
        const remoteObject = await response.json(); // Parse the response JSON
        // remoteObjectCache.set(objectId, remoteObject); // Removed in-memory cache
        this.logger.log(`Successfully fetched remote object: '${objectId}'.`);
        return remoteObject;
      } catch (error) {
        this.logger.error(`Error fetching remote object '${objectId}' (Attempt ${retries + 1}): ${error.message}.`, error.stack);
        retries++;
        if (retries < MAX_RETRIES) {
          // Exponential backoff: wait longer with each retry (1s, 2s, 4s...)
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries - 1)));
        }
      }
    }
    this.logger.error(`Failed to fetch remote object after ${MAX_RETRIES} attempts: '${objectId}'.`);
    return null;
  }

  /**
   * Fetches a remote ActivityPub object and stores it in the local database if not already present.
   * This is particularly useful for objects referenced in incoming activities (e.g., `inReplyTo` objects
   * in replies, or `object` of `Announce` activities) to build a local cache of federated content.
   * @param objectId The ActivityPub URI of the remote object.
   * @returns The stored ContentObjectEntity, or null if fetching/storing failed.
   */
  async fetchAndStoreRemoteObject(objectId: string): Promise<ContentObjectEntity | null> {
    this.logger.debug(`Attempting to fetch and store remote object: '${objectId}'.`);

    // First, check if it's already in our local ContentObjectEntity table to avoid redundant fetches/storage.
    let localContentObject = await this.contentObjectRepository.findOne({
      where: { activityPubId: objectId, deletedAt: IsNull() },
    });

    if (localContentObject) {
      this.logger.debug(`Object '${objectId}' already exists locally. No need to fetch or store.`);
      return localContentObject;
    }

    // If not local, fetch it remotely from the network.
    const remoteObjectData = await this.fetchRemoteObject(objectId);

    if (remoteObjectData) {
      // Ensure the fetched object has an ID. Use the requested objectId as fallback if the remote object's ID is missing.
      const canonicalId = remoteObjectData.id ? String(remoteObjectData.id) : objectId;

      // Check again in case the remote object's canonical ID is different from the requested objectId
      // and already exists locally (e.g., due to URI canonicalization differences).
      localContentObject = await this.contentObjectRepository.findOne({
        where: { activityPubId: canonicalId, deletedAt: IsNull() },
      });

      if (localContentObject) {
        this.logger.debug(`Object '${canonicalId}' (from remote fetch) already exists locally. No need to store.`);
        return localContentObject;
      }

      // Store the new remote object in our database.
      const newContentObject = this.contentObjectRepository.create({
        activityPubId: canonicalId,
        type: remoteObjectData.type ? String(remoteObjectData.type) : 'Unknown', // Default type if not specified
        attributedToActivityPubId: remoteObjectData.attributedTo ? String(remoteObjectData.attributedTo) : (remoteObjectData.actor ? String(remoteObjectData.actor) : 'unknown'), // Actor who created/attributed it
        data: remoteObjectData, // Store the full JSON-LD payload
      });
      await this.contentObjectRepository.save(newContentObject);
      this.logger.log(`Stored new remote content object (ID: '${newContentObject.activityPubId}', Type: '${newContentObject.type}').`);
      return newContentObject;
    }

    this.logger.warn(`Could not fetch or store remote object: '${objectId}'.`);
    return null;
  }

  /**
   * Fetches a public key (PEM format) from a given keyId URI, with Redis caching.
   * This method is crucial for verifying HTTP Signatures from remote instances.
   * A keyId typically points to a 'publicKey' object embedded within an actor's profile.
   * @param keyId The URI of the public key (e.g., 'https://mastodon.social/users/exampleuser#main-key').
   * @returns The public key in PEM format as a string, or null if not found/resolvable.
   */
  async fetchPublicKey(keyId: string): Promise<string | null> {
    this.logger.debug(`Attempting to fetch public key for keyId: '${keyId}'.`);

    const cacheKey = `publicKey:${keyId}`;
    const cachedKey = await this.redisClient.get(cacheKey);
    if (cachedKey) {
      this.logger.debug(`Public key for '${keyId}' found in Redis cache.`);
      return cachedKey === 'null' ? null : cachedKey; // Handle cached 'null' string
    }

    const MAX_RETRIES = 3;
    let retries = 0;
    while (retries < MAX_RETRIES) {
      try {
        // The keyId often points to the actor's profile, with a fragment for the key.
        // We need to fetch the actor's profile first.
        const urlObj = new URL(keyId);
        const actorUrl = urlObj.origin + urlObj.pathname; // Get the base actor URL without fragment

        this.logger.log(`Fetching actor profile for public key discovery from: '${actorUrl}' (Attempt ${retries + 1}/${MAX_RETRIES}).`);
        const response = await fetch(actorUrl, {
          headers: { Accept: 'application/activity+json, application/ld+json' },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch actor profile '${actorUrl}' for keyId '${keyId}': ${response.status} ${response.statusText} - ${errorText}`);
        }

        const actorProfile = await response.json();

        // Navigate the JSON-LD to find the public key
        if (actorProfile.publicKey && actorProfile.publicKey.id === keyId && actorProfile.publicKey.publicKeyPem) {
          const publicKeyPem = String(actorProfile.publicKey.publicKeyPem);
          await this.redisClient.set(cacheKey, publicKeyPem, 'EX', 60 * 60 * 24); // Cache for 24 hours
          this.logger.log(`Successfully fetched and cached public key for '${keyId}'.`);
          return publicKeyPem;
        } else {
          this.logger.warn(`Public key with ID '${keyId}' not found in actor profile '${actorUrl}'. Profile: ${JSON.stringify(actorProfile)}`);
          // Attempt to find it in an array of public keys if present (less common but possible)
          if (Array.isArray(actorProfile.publicKey)) {
            const foundKey = actorProfile.publicKey.find((pk: any) => pk.id === keyId && pk.publicKeyPem);
            if (foundKey) {
              const publicKeyPem = String(foundKey.publicKeyPem);
              await this.redisClient.set(cacheKey, publicKeyPem, 'EX', 60 * 60 * 24); // Cache for 24 hours
              this.logger.log(`Successfully fetched and cached public key for '${keyId}' from array.`);
              return publicKeyPem;
            }
          }
        }
        this.logger.warn(`Public key for keyId '${keyId}' not found in fetched actor profile.`);
        await this.redisClient.set(cacheKey, 'null', 'EX', 60 * 60); // Cache null for 1 hour
        return null;

      } catch (error) {
        this.logger.error(`Error fetching public key for '${keyId}' (Attempt ${retries + 1}): ${error.message}.`, error.stack);
        retries++;
        if (retries < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries - 1)));
        }
      }
    }
    this.logger.error(`Failed to fetch public key after ${MAX_RETRIES} attempts: '${keyId}'.`);
    await this.redisClient.set(cacheKey, 'null', 'EX', 60 * 60); // Cache null even after retries fail
    return null;
  }
}
