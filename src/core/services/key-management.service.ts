// src/shared/services/key-management.service.ts

import { Inject, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorEntity } from 'src/features/activitypub/entities/actor.entity';
import { LoggerService } from '../../shared/services/logger.service';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, createPrivateKey, KeyObject } from 'crypto';
import { InvalidKeyIdFormatException } from '../../shared/exceptions/invalid-key-id-format.exception'; // Assuming this exists or will be created
import { URL } from 'url';
import { normalizeUrl } from '../../shared/utils/url-normalizer';
import { createHash } from 'crypto';
import { RemoteObjectService } from './remote-object.service';

/**
 * KeyManagementService
 *
 * Manages the generation, storage, and retrieval of RSA public and private keys
 * for ActivityPub actors. It's responsible for fetching remote public keys
 * and providing local private keys for signing.
 *
 * For local actors: Generates and stores a public/private key pair.
 * For remote actors: Fetches and caches their public key.
 */
@Injectable()
export class KeyManagementService {
  private readonly instanceBaseUrl: string;

  constructor(
    @InjectRepository(ActorEntity)
    private readonly actorRepository: Repository<ActorEntity>,
    private readonly logger: LoggerService,
    private readonly remoteObjectService: RemoteObjectService,
    private readonly configService: ConfigService,
  ) {
    this.logger.setContext('KeyManagementService');
    const baseUrl = this.configService.get<string>('INSTANCE_BASE_URL');
    if (!baseUrl) {
      this.logger.error('INSTANCE_BASE_URL is not defined in environment variables.');
      throw new Error('INSTANCE_BASE_URL is not defined.');
    }
    this.instanceBaseUrl = baseUrl;
  }

  /**
   * Generates a new RSA public/private key pair.
   * @returns An object containing the PEM-encoded private and public keys.
   */
  async generateKeyPair(): Promise<{ publicKeyPem: string; privateKeyPem: string }> {
    this.logger.log('Generating new RSA key pair...');
    // Generate an RSA key pair
    // Default options: 2048-bit key, public exponent 65537
    const { publicKey, privateKey } = await new Promise<{ publicKey: KeyObject; privateKey: KeyObject }>(
      (resolve, reject) => {
        // Use 'generateKeyPair' from 'crypto' module
        // This is asynchronous and more secure than sync methods
        require('crypto').generateKeyPair('rsa', {
          modulusLength: 2048, // Recommended for RSA
          publicKeyEncoding: {
            type: 'spki', // Recommended for ActivityPub
            format: 'pem',
          },
          privateKeyEncoding: {
            type: 'pkcs8', // Recommended for ActivityPub
            format: 'pem',
            // cipher: 'aes-256-cbc', // Optional: encrypt private key with a passphrase
            // passphrase: 'top secret',
          },
        }, (err, publicKey, privateKey) => {
          if (err) reject(err);
          resolve({ publicKey: createPublicKey(publicKey), privateKey: createPrivateKey(privateKey) });
        });
      }
    );

    // Convert KeyObject to PEM string explicitly if not already
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    this.logger.log('RSA key pair generated successfully.');
    return { publicKeyPem, privateKeyPem };
  }

  /**
   * Retrieves the public key (PEM format) for a given key ID (actor's public key ID).
   * It first checks local actors, then attempts to fetch from remote if not found.
   * @param keyId The full ActivityPub key ID (e.g., https://example.com/users/alice#main-key).
   * @returns The PEM-encoded public key string.
   * @throws NotFoundException if the public key cannot be found or fetched.
   */
  async getPublicKey(keyId: string): Promise<string> {
    this.logger.debug(`Attempting to retrieve public key for keyId: ${keyId}`);

    // First, try to find a local actor whose public key ID matches.
    // The keyId is typically `actorId#main-key`. Extract actorId from keyId.
    const actorActivityPubId = this.extractActorIdFromKeyId(keyId);
    this.logger.debug(`Extracted actorActivityPubId from keyId: ${actorActivityPubId}`);

    if (!actorActivityPubId) {
        this.logger.error(`Could not extract valid actor ActivityPub ID from keyId: ${keyId}`);
        throw new InvalidKeyIdFormatException(`Invalid keyId format: ${keyId}`);
    }

    // Attempt to find actor by their activityPubId locally first
    let actor = await this.actorRepository.findOne({
      where: { activityPubId: normalizeUrl(actorActivityPubId) },
    });

    if (actor && actor.publicKeyPem) {
      this.logger.debug(`Found local public key for actor: ${actorActivityPubId}`);
      return actor.publicKeyPem;
    }

    // If not found locally, or local actor doesn't have a public key, fetch remotely
    this.logger.log(`Public key not found locally for actor '${actorActivityPubId}'. Attempting to fetch remote actor profile.`);
    try {
      const remoteActorData = await this.remoteObjectService.fetchRemoteObject(actorActivityPubId);

      if (remoteActorData) {
        const extractedPublicKeyPem = remoteActorData.publicKey?.publicKeyPem;
        this.logger.debug(`Fetched remote actor data for ${actorActivityPubId}. Extracted publicKeyPem: ${extractedPublicKeyPem ? 'YES' : 'NO'}`);

        if (extractedPublicKeyPem) {
          // If remote actor found and has public key, save/update it locally for caching
          if (!actor) {
            // Create a new actor entity if it doesn't exist
            actor = this.actorRepository.create({
              activityPubId: normalizeUrl(remoteActorData.id),
              preferredUsername: remoteActorData.preferredUsername,
              name: remoteActorData.name,
              summary: remoteActorData.summary,
              inbox: normalizeUrl(remoteActorData.inbox),
              outbox: normalizeUrl(remoteActorData.outbox),
              followersUrl: remoteActorData.followers,
              followingUrl: remoteActorData.following,
              likedUrl: remoteActorData.liked,
              publicKeyPem: extractedPublicKeyPem,
              isLocal: false,
              data: remoteActorData, // Store the full fetched data
            });
          } else {
            // Update existing actor with public key if it was missing
            actor.publicKeyPem = extractedPublicKeyPem;
            actor.data = remoteActorData; // Update full fetched data
          }
          const savedActor = await this.actorRepository.save(actor);
          this.logger.log(`Public key for remote actor '${actorActivityPubId}' saved/updated locally. Actor ID: ${savedActor.id}`);
          return extractedPublicKeyPem;
        } else {
          this.logger.warn(`Remote actor profile for ${actorActivityPubId} found, but no publicKeyPem property.`);
          throw new NotFoundException(`Public key not found in remote actor profile for keyId: ${keyId}`);
        }
      } else {
        this.logger.warn(`Failed to fetch remote actor profile for ${actorActivityPubId}.`);
        throw new NotFoundException(`Remote actor profile not found for keyId: ${keyId}`);
      }
    } catch (error) {
      this.logger.error(`Error fetching or processing public key for ${keyId}: ${error.message}`, error.stack);
      // Re-throw specific errors or wrap in a generic one
      if (error instanceof NotFoundException || error instanceof InvalidKeyIdFormatException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to retrieve public key: ${error.message}`);
    }
  }

  /**
   * Retrieves the private key (PEM format) for a given actor ID.
   * This should only be called for local actors.
   * @param actorId The internal database ID of the local actor.
   * @returns The PEM-encoded private key string.
   * @throws NotFoundException if the actor or their private key is not found.
   * @throws UnauthorizedException if attempting to get private key for a non-local actor.
   */
  async getPrivateKey(actorId: string): Promise<string> {
    this.logger.debug(`Attempting to retrieve private key for actor ID: ${actorId}`);
    const actor = await this.actorRepository.findOne({
      where: { id: actorId, isLocal: true },
      select: ['privateKeyPem'], // Explicitly select privateKeyPem as it's @Exclude'd by default
    });

    if (!actor) {
      this.logger.warn(`Actor with ID '${actorId}' not found or is not a local actor.`);
      throw new NotFoundException(`Local actor with ID '${actorId}' not found.`);
    }

    if (!actor.privateKeyPem) {
      this.logger.error(`Private key not found for local actor: ${actorId}`);
      throw new InternalServerErrorException(`Private key not found for local actor: ${actorId}`);
    }

    return actor.privateKeyPem;
  }

  /**
   * Generates a SHA-256 digest of a given string.
   * Used for the 'Digest' HTTP header in signed requests.
   * @param data The string data to digest.
   * @returns The SHA-256 digest as a base64 encoded string, prefixed with 'SHA-256='.
   */
  generateDigest(data: string): string {
    const hash = createHash('sha256');
    hash.update(data);
    const digest = hash.digest('base64');
    this.logger.debug(`Generated SHA-256 digest: SHA-256=${digest}`);
    return `SHA-256=${digest}`;
  }

  /**
   * Helper to extract the base actor ActivityPub ID from a key ID.
   * Assumes keyId is typically in the format `actorId#keyName`.
   * @param keyId The full ActivityPub key ID.
   * @returns The base actor ActivityPub ID, or null if invalid format.
   */
  private extractActorIdFromKeyId(keyId: string): string | null {
    try {
      const url = new URL(keyId);
      // Remove the hash fragment to get the base actor ID
      const actorId = url.origin + url.pathname;
      return normalizeUrl(actorId); // Ensure normalized URL
    } catch (e) {
      this.logger.error(`Failed to parse keyId as URL: ${keyId}. Error: ${e.message}`);
      return null;
    }
  }
}
