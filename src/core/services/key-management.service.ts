// src/core/services/key-management.service.ts

import { Inject, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorEntity } from 'src/features/activitypub/entities/actor.entity';
import { LoggerService } from '../../shared/services/logger.service';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, createPrivateKey, KeyObject, createSign, createHash } from 'crypto';
import { InvalidKeyIdFormatException } from '../../shared/exceptions/invalid-key-id-format.exception';
import { URL } from 'url';
import { normalizeUrl } from '../../shared/utils/url-normalizer';
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
    const { publicKey, privateKey } = await new Promise<{ publicKey: KeyObject; privateKey: KeyObject }>(
      (resolve, reject) => {
        require('crypto').generateKeyPair('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
          },
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
          },
        }, (err, publicKey, privateKey) => {
          if (err) reject(err);
          resolve({ publicKey: createPublicKey(publicKey), privateKey: createPrivateKey(privateKey) });
        });
      }
    );

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

    const actorActivityPubId = this.extractActorIdFromKeyId(keyId);
    this.logger.debug(`Extracted actorActivityPubId from keyId: ${actorActivityPubId}`);

    if (!actorActivityPubId) {
        this.logger.error(`Could not extract valid actor ActivityPub ID from keyId: ${keyId}`);
        throw new InvalidKeyIdFormatException(`Invalid keyId format: ${keyId}`);
    }

    let actor = await this.actorRepository.findOne({
      where: { activityPubId: normalizeUrl(actorActivityPubId) },
    });

    if (actor && actor.publicKeyPem) {
      this.logger.debug(`Found local public key for actor: ${actorActivityPubId}`);
      return actor.publicKeyPem;
    }

    this.logger.log(`Public key not found locally for actor '${actorActivityPubId}'. Attempting to fetch remote actor profile.`);
    try {
      const remoteActorData = await this.remoteObjectService.fetchRemoteObject(actorActivityPubId);

      if (remoteActorData) {
        const extractedPublicKeyPem = remoteActorData.publicKey?.publicKeyPem;
        this.logger.debug(`Fetched remote actor data for ${actorActivityPubId}. Extracted publicKeyPem: ${extractedPublicKeyPem ? 'YES' : 'NO'}`);

        if (extractedPublicKeyPem) {
          if (!actor) {
            actor = this.actorRepository.create({
              activityPubId: normalizeUrl(remoteActorData.id),
              preferredUsername: remoteActorData.preferredUsername,
              name: remoteActorData.name,
              summary: remoteActorData.summary,
              inbox: remoteActorData.inbox,
              outbox: remoteActorData.outbox,
              followersUrl: remoteActorData.followers,
              followingUrl: remoteActorData.following || '',
              likedUrl: remoteActorData.liked || '',
              publicKeyPem: extractedPublicKeyPem,
              isLocal: false,
              data: remoteActorData,
            });
          } else {
            actor.publicKeyPem = extractedPublicKeyPem;
            actor.data = remoteActorData;
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
   * @throws InternalServerErrorException if private key is not found after retrieval.
   */
  async getPrivateKey(actorId: string): Promise<string> {
    this.logger.debug(`Attempting to retrieve private key for actor ID: ${actorId}`);
    // The select clause in ActorService.findActorById should handle loading privateKeyPem.
    const actor = await this.actorRepository.findOne({
      where: { id: actorId, isLocal: true },
      // FIX: Explicitly select privateKeyPem here as a fallback,
      // although ActorService.findActorById should already load it.
      // This ensures we are *certain* to try and load it.
      select: ['id', 'privateKeyPem'],
    });

    // DIAGNOSTIC LOG: Check the actor object and privateKeyPem immediately after retrieval
    this.logger.debug(`KeyManagementService: Actor object retrieved for ID ${actorId}: ${JSON.stringify(actor ? { id: actor.id, privateKeyPemPresent: !!actor.privateKeyPem } : 'null')}`);


    if (!actor) {
      this.logger.warn(`Actor with ID '${actorId}' not found or is not a local actor.`);
      throw new NotFoundException(`Local actor with ID '${actorId}' not found.`);
    }

    if (!actor.privateKeyPem) {
      this.logger.error(`Private key not found for local actor: ${actorId} after database retrieval.`);
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
   * Creates the signing string for HTTP Signatures as per the specification.
   * This string is then signed with the private key.
   *
   * @param headers The HTTP headers object (keys should be lowercase).
   * @param signedHeaders An array of header names (including pseudo-headers like '(request-target)') to be signed.
   * @param method The HTTP method (e.g., 'POST').
   * @param url The full URL of the request.
   * @returns The signing string.
   */
  createSigningString(
    headers: Record<string, string>,
    signedHeaders: string[],
    method: string,
    url: string,
  ): string {
    const lines: string[] = [];
    const parsedUrl = new URL(url);

    for (const headerName of signedHeaders) {
      if (headerName === '(request-target)') {
        lines.push(`(request-target): ${method.toLowerCase()} ${parsedUrl.pathname}${parsedUrl.search}`);
      } else if (headerName === 'host') {
        lines.push(`host: ${parsedUrl.hostname}`); // Use hostname from parsed URL for host header
      } else {
        const headerValue = headers[headerName.toLowerCase()]; // Headers object might have lowercase keys
        if (headerValue === undefined) {
          this.logger.warn(`Header '${headerName}' is in signedHeaders but not present in provided headers.`);
          // According to spec, if a header is signed but not present, its value is empty.
          lines.push(`${headerName.toLowerCase()}:`);
        } else {
          lines.push(`${headerName.toLowerCase()}: ${headerValue}`);
        }
      }
    }
    const signingString = lines.join('\n');
    this.logger.debug(`Generated signing string: \n${signingString}`);
    return signingString;
  }

  /**
   * Signs a string using the provided private key (PEM format) and algorithm.
   *
   * @param signingString The string to sign.
   * @param privateKeyPem The PEM-encoded private key.
   * @param algorithm The signing algorithm (e.g., 'rsa-sha256').
   * @returns The base64-encoded signature.
   */
  signString(signingString: string, privateKeyPem: string, algorithm: string): string {
    const signer = createSign('RSA-SHA256'); // Node.js crypto uses 'RSA-SHA256' for rsa-sha256
    signer.update(signingString);
    const signature = signer.sign(privateKeyPem, 'base64');
    this.logger.debug(`Generated signature: ${signature}`);
    return signature;
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
