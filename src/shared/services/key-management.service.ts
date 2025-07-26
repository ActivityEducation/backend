// src/shared/services/key-management.service.ts

import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorEntity } from '../../features/activitypub/entities/actor.entity';
import { LoggerService } from './logger.service';
import { generateKeyPairSync, createHash } from 'crypto'; // Import createHash for digest generation
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Service for managing cryptographic keys (RSA public/private pairs) for ActivityPub actors.
 * In a production environment, private keys should be stored and retrieved from a secure
 * Key Management System (KMS) like HashiCorp Vault. For development/MVP, this service
 * provides a temporary mechanism for key generation and retrieval, either from environment
 * variables or local files, with clear warnings about production implications.
 */
@Injectable()
export class KeyManagementService {
  private readonly keysDirectory: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ActorEntity)
    private readonly actorRepository: Repository<ActorEntity>,
    private readonly logger: LoggerService, // Inject custom logger
  ) {
    this.logger.setContext('KeyManagementService');
    this.keysDirectory = path.join(process.cwd(), 'data', 'keys'); // Define a local directory for dev keys
  }

  /**
   * Generates a new RSA public/private key pair for an ActivityPub actor.
   *
   * @returns An object containing the PEM-encoded private key and public key.
   */
  generateKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
    this.logger.log('Generating new RSA key pair...');
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048, // Recommended for strong security
      publicKeyEncoding: {
        type: 'spki', // SubjectPublicKeyInfo
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8', // Public-Key Cryptography Standards #8
        format: 'pem',
      },
    });
    this.logger.log('RSA key pair generated successfully.');
    return { privateKeyPem: privateKey, publicKeyPem: publicKey };
  }

  /**
   * Retrieves the public key (PEM-encoded) for a given keyId.
   * A keyId is typically an ActivityPub Actor's URI concatenated with '#main-key'.
   * This method first checks local actors, then attempts to fetch from remote if not found.
   *
   * @param keyId The ID of the key to retrieve (e.g., https://example.com/users/alice#main-key).
   * @returns The PEM-encoded public key string.
   * @throws NotFoundException if the public key cannot be found.
   * @throws InternalServerErrorException if there's an issue retrieving the key.
   */
  async getPublicKey(keyId: string): Promise<string> {
    this.logger.debug(`Attempting to retrieve public key for keyId: ${keyId}`);

    // Extract actor URI from keyId (assuming standard format: actorURI#keyName)
    const actorUriMatch = keyId.match(/(.+?)#.+/);
    if (!actorUriMatch || !actorUriMatch[1]) {
      this.logger.warn(`Invalid keyId format: ${keyId}`);
      throw new NotFoundException(`Public key not found: Invalid keyId format.`);
    }
    const actorUri = actorUriMatch[1];

    // 1. Check local database for actor's public key
    try {
      const actor = await this.actorRepository.findOne({
        where: { activityPubId: actorUri },
        select: ['publicKeyPem'], // Select only the publicKeyPem to avoid loading private key
      });

      if (actor?.publicKeyPem) {
        this.logger.debug(`Public key found locally for actor: ${actorUri}`);
        return actor.publicKeyPem;
      }
    } catch (dbError) {
      this.logger.error(`Database error retrieving public key for ${actorUri}: ${dbError.message}`, dbError.stack);
      throw new InternalServerErrorException(`Failed to retrieve public key from database.`);
    }

    // 2. If not found locally, attempt to fetch the actor's profile remotely
    // This is a circular dependency if RemoteObjectService directly calls KeyManagementService
    // which then calls RemoteObjectService. Instead, the logic to fetch remote actor's
    // profile and extract public key should be in RemoteObjectService.
    // For now, if the public key is not in our DB, we assume RemoteObjectService would have
    // fetched and stored it if it was a known remote actor.
    // This implies that any remote actor whose key is needed for signature verification
    // must already be in our 'actors' table.
    this.logger.warn(`Public key not found locally for keyId: ${keyId}.`);
    throw new NotFoundException(`Public key not found for keyId: ${keyId}`);
  }

  /**
   * Retrieves the private key (PEM-encoded) for a given local actor's internal ID.
   * This method should only be used for local actors.
   *
   * @param actorId The internal database ID of the local actor.
   * @returns The PEM-encoded private key string.
   * @throws NotFoundException if the actor or their private key is not found.
   * @throws InternalServerErrorException if there's an issue retrieving the key.
   */
  async getPrivateKey(actorId: string): Promise<string> {
    this.logger.debug(`Attempting to retrieve private key for actor ID: ${actorId}`);
    try {
      const actor = await this.actorRepository.findOne({
        where: { id: actorId, isLocal: true },
        select: ['privateKeyPem'], // Explicitly select privateKeyPem
      });

      if (!actor) {
        throw new NotFoundException(`Local actor with ID '${actorId}' not found.`);
      }
      if (!actor.privateKeyPem) {
        // Fallback to loading from local file in development, if needed
        try {
          const privateKeyFromFile = await this.loadPrivateKeyLocally(actorId);
          // Update the actor in DB if key was found in file but not DB
          if (privateKeyFromFile) {
            actor.privateKeyPem = privateKeyFromFile;
            await this.actorRepository.save(actor); // Persist to DB for future use
            return privateKeyFromFile;
          }
        } catch (fileError) {
          this.logger.warn(`Private key not found in DB and failed to load from file for actor ${actorId}: ${fileError.message}`);
        }
        throw new NotFoundException(`Private key not found for actor ID '${actorId}'.`);
      }
      this.logger.debug(`Private key found for actor ID: ${actorId}`);
      return actor.privateKeyPem;
    } catch (error) {
      this.logger.error(`Error retrieving private key for actor ${actorId}: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) {
        throw error; // Re-throw specific NotFoundException
      }
      throw new InternalServerErrorException(`Failed to retrieve private key.`);
    }
  }

  /**
   * Generates a SHA-256 digest of a given string (typically the raw request body).
   *
   * @param data The string data to digest.
   * @returns The base64-encoded SHA-256 digest.
   */
  generateDigest(data: string): string {
    return createHash('sha256').update(data).digest('base64');
  }

  /**
   * Securely stores a private key to a local file (for development only).
   * In production, this should integrate with HashiCorp Vault or similar KMS.
   *
   * @param actorId The internal ID of the actor.
   * @param privateKeyPem The PEM-encoded private key.
   * @returns Promise<void>
   */
  async storePrivateKeyLocally(actorId: string, privateKeyPem: string): Promise<void> {
    const filePath = path.join(this.keysDirectory, `${actorId}.pem`);
    try {
      await fs.mkdir(this.keysDirectory, { recursive: true });
      await fs.writeFile(filePath, privateKeyPem, { mode: 0o600 }); // Owner read/write only
      this.logger.warn(`Private key for actor ${actorId} stored locally at ${filePath}. THIS IS FOR DEVELOPMENT ONLY. USE KMS IN PRODUCTION.`);
    } catch (error) {
      this.logger.error(`Failed to store private key locally for actor ${actorId}: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to store private key locally.`);
    }
  }

  /**
   * Loads a private key from a local file (for development only).
   * In production, this should integrate with HashiCorp Vault or similar KMS.
   *
   * @param actorId The internal ID of the actor.
   * @returns The PEM-encoded private key string.
   * @throws NotFoundException if the file does not exist.
   * @throws InternalServerErrorException for other file system errors.
   */
  async loadPrivateKeyLocally(actorId: string): Promise<string> {
    const filePath = path.join(this.keysDirectory, `${actorId}.pem`);
    try {
      const privateKeyPem = await fs.readFile(filePath, 'utf8');
      this.logger.debug(`Private key for actor ${actorId} loaded from local file.`);
      return privateKeyPem;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException(`Private key file for actor ${actorId} not found at ${filePath}.`);
      }
      this.logger.error(`Failed to load private key locally for actor ${actorId}: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to load private key locally.`);
    }
  }
}
