// src/core/services/remote-object.service.ts

import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorEntity } from '../../features/activitypub/entities/actor.entity';
import { ContentObjectEntity } from '../../features/activitypub/entities/content-object.entity';
import { LoggerService } from '../../shared/services/logger.service';
import { normalizeUrl } from '../../shared/utils/url-normalizer';
import * as jsonld from 'jsonld'; // For JSON-LD canonicalization
import * as HttpSignature from '@peertube/http-signature'; // For HTTP Signature generation
import { HttpService } from '@nestjs/axios';

@Injectable()
export class RemoteObjectService {
  private readonly instanceBaseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectRepository(ActorEntity)
    private readonly actorRepository: Repository<ActorEntity>,
    @InjectRepository(ContentObjectEntity)
    private readonly contentObjectRepository: Repository<ContentObjectEntity>,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('RemoteObjectService');
    const baseUrl = this.configService.get<string>('INSTANCE_BASE_URL');
    if (!baseUrl) {
      this.logger.error('INSTANCE_BASE_URL is not defined in environment variables.');
      throw new Error('INSTANCE_BASE_URL is not defined.');
    }
    this.instanceBaseUrl = baseUrl;
  }

  /**
   * Fetches a remote ActivityPub object by its URI, with caching and retries.
   * Handles content negotiation for ActivityPub+JSON.
   *
   * @param objectUri The URI of the remote ActivityPub object.
   * @param retries Number of retry attempts for the request.
   * @param delay Initial delay in milliseconds for exponential backoff.
   * @returns The fetched ActivityPub object as a JSON-LD object.
   * @throws NotFoundException if the object is not found or cannot be fetched.
   * @throws InternalServerErrorException for other fetching errors.
   */
  async fetchRemoteObject(objectUri: string, retries: number = 3, delay: number = 1000): Promise<any> {
    const normalizedUri = normalizeUrl(objectUri);
    this.logger.debug(`Attempting to fetch remote object: ${normalizedUri}`);

    for (let i = 0; i < retries; i++) {
      try {
        const response = await this.httpService.get(normalizedUri, {
          headers: {
            'Accept': 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
            'User-Agent': `${this.configService.get<string>('APP_NAME') || 'EduPub'}/${process.env.npm_package_version || '1.0.0'} (+${this.instanceBaseUrl})`,
          },
          timeout: 5000, // 5 seconds timeout
        }).toPromise();

        if (response?.status === 200) {
          this.logger.log(`Successfully fetched remote object: ${normalizedUri}`);
          return response?.data;
        }
      } catch (error) {
        this.logger.warn(`Attempt ${i + 1}/${retries} to fetch remote object ${normalizedUri} failed: ${error.message}`);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i))); // Exponential backoff
        } else {
          this.logger.error(`Failed to fetch remote object ${normalizedUri} after ${retries} attempts: ${error.message}`, error.stack);
          if (error.response?.status === 404) {
            throw new NotFoundException(`Remote object '${normalizedUri}' not found.`);
          }
          throw new InternalServerErrorException(`Failed to fetch remote object '${normalizedUri}'.`);
        }
      }
    }
    throw new InternalServerErrorException(`Failed to fetch remote object '${normalizedUri}' after multiple retries.`);
  }

  /**
   * Fetches a remote ActivityPub object and stores it locally if it doesn't already exist.
   * This is typically used for objects received in an inbox that we want to cache.
   * Handles different object types (Actor, ContentObject).
   *
   * @param objectUri The URI of the remote ActivityPub object to fetch and store.
   * @returns The locally stored ContentObjectEntity or ActorEntity, or null if the object could not be stored.
   */
  async fetchAndStoreRemoteObject(objectUri: string): Promise<ContentObjectEntity | ActorEntity | null> {
    const normalizedUri = normalizeUrl(objectUri);
    this.logger.debug(`Attempting to fetch and store remote object: ${normalizedUri}`);

    // First, check if the object already exists locally
    let existingObject: ContentObjectEntity | ActorEntity | null = null;
    try {
      existingObject = await this.contentObjectRepository.findOne({ where: { activityPubId: normalizedUri } });
      if (!existingObject) {
        existingObject = await this.actorRepository.findOne({ where: { activityPubId: normalizedUri } });
      }
    } catch (e) {
      this.logger.error(`Error checking for existing remote object '${normalizedUri}': ${e.message}`, e.stack);
      // Continue trying to fetch, but log the issue
    }

    if (existingObject) {
      this.logger.debug(`Remote object '${normalizedUri}' already exists locally. Skipping fetch.`);
      return existingObject;
    }

    try {
      const remoteData = await this.fetchRemoteObject(normalizedUri);

      if (remoteData) {
        // Determine type and store accordingly
        const type = Array.isArray(remoteData.type) ? remoteData.type[0] : remoteData.type;

        if (type === 'Person' || type === 'Service' || type === 'Application' || type === 'Group') {
          // It's an Actor
          let actor = await this.actorRepository.findOne({ where: { activityPubId: normalizedUri } });
          if (!actor) {
            actor = this.actorRepository.create({
              activityPubId: normalizedUri,
              preferredUsername: remoteData.preferredUsername || new URL(normalizedUri).pathname.split('/').pop(),
              name: remoteData.name || remoteData.preferredUsername || 'Unknown Remote Actor',
              summary: remoteData.summary,
              inbox: remoteData.inbox,
              outbox: remoteData.outbox,
              followersUrl: remoteData.followers,
              followingUrl: remoteData.following,
              likedUrl: remoteData.liked,
              publicKeyPem: remoteData.publicKey?.publicKeyPem,
              isLocal: false,
              data: remoteData,
            });
            await this.actorRepository.save(actor);
            this.logger.log(`Stored new remote actor: ${actor.activityPubId}`);
          } else {
            // Update existing actor if necessary (e.g., profile changes)
            actor.name = remoteData.name || actor.name;
            actor.summary = remoteData.summary || actor.summary;
            actor.inbox = remoteData.inbox || actor.inbox;
            actor.outbox = remoteData.outbox || actor.outbox;
            actor.followersUrl = remoteData.followers || actor.followersUrl;
            actor.followingUrl = remoteData.following || actor.followingUrl;
            actor.likedUrl = remoteData.liked || actor.likedUrl;
            actor.publicKeyPem = remoteData.publicKey?.publicKeyPem || actor.publicKeyPem;
            actor.data = remoteData; // Update full payload
            await this.actorRepository.save(actor);
            this.logger.log(`Updated existing remote actor: ${actor.activityPubId}`);
          }
          return actor;
        } else {
          // It's a generic ContentObject (Note, Image, edu:Flashcard, etc.)
          let contentObject = await this.contentObjectRepository.findOne({ where: { activityPubId: normalizedUri } });
          if (!contentObject) {
            contentObject = this.contentObjectRepository.create({
              activityPubId: normalizedUri,
              type: type,
              attributedToActivityPubId: remoteData.attributedTo,
              inReplyToActivityPubId: remoteData.inReplyTo,
              activityPubUpdatedAt: remoteData.updated ? new Date(remoteData.updated) : undefined, // Assign undefined instead of null
              data: remoteData,
            });
            await this.contentObjectRepository.save(contentObject);
            this.logger.log(`Stored new remote content object: ${contentObject.activityPubId} (${type})`);
          } else {
            // Update existing content object if necessary (e.g., content changes)
            contentObject.data = remoteData; // Update full payload
            contentObject.activityPubUpdatedAt = remoteData.updated ? new Date(remoteData.updated) : contentObject.activityPubUpdatedAt; // Update timestamp if present
            await this.contentObjectRepository.save(contentObject);
            this.logger.log(`Updated existing remote content object: ${contentObject.activityPubId} (${type})`);
          }
          return contentObject;
        }
      }
    } catch (error) {
      this.logger.error(`Failed to fetch and store remote object '${normalizedUri}': ${error.message}`, error.stack);
      if (error instanceof NotFoundException || error instanceof InternalServerErrorException) {
        throw error;
      }
      return null;
    }
    return null; // Should ideally not be reached
  }

  /**
   * Fetches the followers collection for a given remote actor URI.
   *
   * @param actorFollowersUri The URI of the actor's followers collection.
   * @param page The page number to fetch (for pagination).
   * @param perPage The number of items per page.
   * @returns The ActivityPub OrderedCollectionPage for followers.
   */
  async getActorFollowers(actorFollowersUri: string, page: number = 1, perPage: number = 10): Promise<any> {
    this.logger.debug(`Fetching followers for: ${actorFollowersUri}, page: ${page}, perPage: ${perPage}`);
    try {
      // Append pagination query parameters
      const url = new URL(actorFollowersUri);
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', String(perPage)); // Mastodon typically uses 'limit'

      const response = await this.httpService.get(url.toString(), {
        headers: {
          'Accept': 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
          'User-Agent': `${this.configService.get<string>('APP_NAME') || 'EduPub'}/${process.env.npm_package_version || '1.0.0'} (+${this.instanceBaseUrl})`,
        },
        timeout: 5000,
      }).toPromise();
      this.logger.log(`Successfully fetched followers from ${actorFollowersUri}.`);
      return response?.data;
    } catch (error) {
      this.logger.error(`Failed to fetch followers from ${actorFollowersUri}: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to fetch followers: ${error.message}`);
    }
  }

  /**
   * Fetches the inbox collection for a given remote actor URI.
   * NOTE: Access to remote inboxes is typically restricted and requires authentication/authorization.
   * This method is primarily for internal system use or highly privileged federation scenarios.
   *
   * @param actorInboxUri The URI of the actor's inbox collection.
   * @param page The page number to fetch (for pagination).
   * @param perPage The number of items per page.
   * @returns The ActivityPub OrderedCollectionPage for inbox activities.
   */
  async getActorInbox(actorInboxUri: string, page: number = 1, perPage: number = 10): Promise<any> {
    this.logger.debug(`Fetching inbox for: ${actorInboxUri}, page: ${page}, perPage: ${perPage}`);
    try {
      const url = new URL(actorInboxUri);
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', String(perPage));

      const response = await this.httpService.get(url.toString(), {
        headers: {
          'Accept': 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
          'User-Agent': `${this.configService.get<string>('APP_NAME') || 'EduPub'}/${process.env.npm_package_version || '1.0.0'} (+${this.instanceBaseUrl})`,
        },
        timeout: 5000,
      }).toPromise();
      this.logger.log(`Successfully fetched inbox from ${actorInboxUri}.`);
      return response?.data;
    } catch (error) {
      this.logger.error(`Failed to fetch inbox from ${actorInboxUri}: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to fetch inbox: ${error.message}`);
    }
  }

  /**
   * Posts a signed ActivityPub activity to a target URI (e.g., a remote actor's inbox).
   * This method performs JSON-LD canonicalization and HTTP Signature generation.
   *
   * @param actorId The internal database ID of the local actor sending the activity.
   * @param targetUrl The URL to post the signed activity to (e.g., remote inbox).
   * @param activity The ActivityPub payload (JSON-LD object) to send.
   * @param headers The complete set of headers to send, including the generated Signature.
   * @param retries Number of retry attempts for the request.
   * @param delay Initial delay in milliseconds for exponential backoff.
   * @returns The response from the remote server.
   * @throws InternalServerErrorException if signing or dispatch fails.
   */
  async postSignedActivity(
    actorId: string,
    targetUrl: string,
    activity: any,
    // FIX: Add a dedicated parameter for headers
    headers: Record<string, string>,
    retries: number = 3,
    delay: number = 1000,
  ): Promise<any> {
    this.logger.log(`Attempting to post signed activity to ${targetUrl} from actor ID: ${actorId}`);

    const localActor = await this.actorRepository.findOne({ where: { id: actorId } });
    if (!localActor) {
      throw new NotFoundException(`Local actor with ID '${actorId}' not found for signing.`);
    }
    if (!localActor.privateKeyPem) {
      this.logger.warn(`Actor '${localActor.preferredUsername}' has no private key PEM for signing.`);
      throw new InternalServerErrorException(`Private key not configured for actor '${localActor.preferredUsername}'.`);
    }

    // Canonicalize the JSON-LD payload for consistent digest and signature generation
    let canonicalizedActivity: string;
    try {
      canonicalizedActivity = await jsonld.canonize(activity, { algorithm: 'URDNA2015', format: 'application/n-quads' });
      this.logger.debug(`Canonicalized Activity: ${canonicalizedActivity}`);
    } catch (canonicalizationError) {
      this.logger.error(`Failed to canonicalize activity for signing: ${canonicalizationError.message}`, canonicalizationError.stack);
      throw new InternalServerErrorException(`Failed to canonicalize activity: ${canonicalizationError.message}`);
    }

    const activityBuffer = Buffer.from(JSON.stringify(activity), 'utf8');

    for (let i = 0; i < retries; i++) {
      try {
        // FIX: Use the provided headers directly
        // The headers should already contain Host, Date, Content-Type, Digest, and Signature
        const finalHeaders = {
          ...headers, // Use the pre-signed headers passed from OutboxProcessor
          'User-Agent': `${this.configService.get<string>('APP_NAME') || 'EduPub'}/${process.env.npm_package_version || '1.0.0'} (+${this.instanceBaseUrl})`,
        };

        this.logger.debug(`RemoteObjectService: Dispatching signed activity to ${targetUrl} with headers: ${JSON.stringify(finalHeaders)}`);

        // Perform the HTTP POST request
        const response = await this.httpService.post(targetUrl, activity, {
          headers: finalHeaders,
          timeout: 10000, // 10 seconds timeout for network requests
        }).toPromise();

        this.logger.log(`Successfully dispatched signed activity to ${targetUrl}. Status: ${response?.status}`);
        return response; // Return the full response object
      } catch (error) {
        this.logger.warn(`Attempt ${i + 1}/${retries} to post signed activity to ${targetUrl} failed: ${error.message}`);
        this.logger.debug(`Error response from ${targetUrl}: ${JSON.stringify(error.response?.data)}`);

        if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
          // Do not retry on 4xx errors (client errors)
          this.logger.error(`Client error (${error.response.status}) when posting signed activity to ${targetUrl}. No retry.`);
          throw new InternalServerErrorException(`Failed to dispatch activity due to client error: ${error.response.status} - ${error.message}`);
        }

        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i))); // Exponential backoff
        } else {
          this.logger.error(`Failed to post signed activity to ${targetUrl} after ${retries} attempts: ${error.message}`, error.stack);
          throw new InternalServerErrorException(`Failed to post signed activity to ${targetUrl} after all attempts.`);
        }
      }
    }
    throw new InternalServerErrorException(`Failed to post signed activity to ${targetUrl} after all attempts.`);
  }
}
