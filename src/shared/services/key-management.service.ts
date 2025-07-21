import { Injectable, Logger, Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios'; // For fetching remote public keys
import { firstValueFrom } from 'rxjs'; // To convert AxiosObservable to Promise
import { InjectRepository } from '@nestjs/typeorm';
import { ActorEntity } from '../../features/activitypub/entities/actor.entity';
import { LoggerService } from './logger.service';

/**
 * KeyManagementService handles the generation, storage, and retrieval of
 * RSA public and private keys for ActivityPub Actors. It also manages
 * fetching and caching public keys for remote actors.
 */
@Injectable()
export class KeyManagementService {
  private readonly PUBLIC_KEY_CACHE_TTL = 3600 * 24; // Cache public keys for 24 hours (in seconds)

  constructor(
    @InjectRepository(ActorEntity)
    private readonly actorRepository: Repository<ActorEntity>,
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('KeyManagementService');
  }

  /**
   * Generates a new RSA key pair (public and private keys) suitable for HTTP Signatures.
   * This method is typically called when a new Actor is created.
   * @returns An object containing the PEM-encoded public and private keys.
   */
  generateKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048, // Standard length for security
      publicKeyEncoding: {
        type: 'spki', // SubjectPublicKeyInfo
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8', // PrivateKeyInfo
        format: 'pem',
        // cipher: 'aes-256-cbc', // Consider encrypting private key at rest in production
        // passphrase: 'your-secure-passphrase', // Use a strong passphrase from secrets management
      },
    });
    this.logger.log('RSA key pair generated successfully.');
    return { publicKeyPem: publicKey, privateKeyPem: privateKey };
  }

  /**
   * Retrieves the private key for a local Actor.
   * This key is used for signing outgoing activities.
   * @param actorId The ID (URI) of the local Actor.
   * @returns The PEM-encoded private key.
   * @throws NotFoundException if the actor is not found or has no private key.
   */
  async getPrivateKey(actorId: string): Promise<string> {
    const actor = await this.actorRepository.findOne({ where: { activityPubId: actorId } });
    if (!actor || !actor.privateKeyPem) {
      this.logger.error(`Private key not found for local actor: ${actorId}`);
      throw new Error(`Private key not found for actor: ${actorId}`); // Or a more specific exception
    }
    return actor.privateKeyPem;
  }

  /**
   * Retrieves the public key for any ActivityPub Actor (local or remote) by its keyId URI.
   * This method first checks the cache, then attempts to fetch the key via HTTP if not found.
   * @param keyId The URI of the public key (e.g., https://instance.com/actors/alice#main-key).
   * @returns The PEM-encoded public key.
   * @throws Error if the public key cannot be retrieved.
   */
  async getPublicKey(keyId: string): Promise<string> {
    // 1. Check cache first
    // const cachedPublicKey: string | undefined =
    //   await this.cacheManager.get(keyId);
    // if (cachedPublicKey) {
    //   this.logger.debug(`Public key for ${keyId} found in cache.`);
    //   return cachedPublicKey;
    // }

    this.logger.debug(`Public key for ${keyId} not in cache, fetching...`);

    try {
      // 2. Fetch the public key from the keyId URI
      // The keyId URI typically points to the Actor's profile, which contains the publicKey object.
      const response = await firstValueFrom(
        this.httpService.get(keyId, {
          headers: {
            Accept:
              'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
          },
          timeout: 5000, // 5-second timeout for fetching remote keys
        }),
      );

      const actorProfile = response.data;

      // Validate the response structure and extract the public key
      if (
        !actorProfile ||
        !actorProfile.publicKey ||
        !actorProfile.publicKey.publicKeyPem
      ) {
        throw new Error(
          `Invalid Actor profile or missing public key at ${keyId}`,
        );
      }

      const publicKeyPem = actorProfile.publicKey.publicKeyPem;

      // 3. Store in cache
      // await this.cacheManager.set(
      //   keyId,
      //   publicKeyPem,
      //   this.PUBLIC_KEY_CACHE_TTL * 1000,
      // ); // TTL in milliseconds
      // this.logger.log(`Public key for ${keyId} fetched and cached.`);
      this.logger.log(`Public key for ${keyId} fetched.`);

      return publicKeyPem;
    } catch (error) {
      this.logger.error(
        `Failed to retrieve public key for ${keyId}: ${error.message}`,
        error.stack,
      );
      throw new Error(
        `Failed to retrieve public key for ${keyId}: ${error.message}`,
      );
    }
  }
}
