import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common'; // Import ConflictException
import { JwtService } from '@nestjs/jwt'; // For creating and signing JWTs
import { InjectRepository } from '@nestjs/typeorm'; // For injecting TypeORM repositories
import { Repository } from 'typeorm'; // TypeORM Repository type
import * as bcrypt from 'bcrypt'; // Import bcrypt for password hashing and comparison
import { AppService } from '../../core/services/app.service';
import { ActorEntity } from '../activitypub/entities/actor.entity';
import { LoggerService } from 'src/shared/services/logger.service';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService, // JWT service for token operations
    private readonly logger: LoggerService, // Custom logger
    @InjectRepository(ActorEntity)
    private readonly actorRepository: Repository<ActorEntity>, // Repository for ActorEntity
    private readonly appService: AppService, // AppService for ActivityPub actor creation
  ) {
    this.logger.setContext('AuthService'); // Set context for the logger
  }

  /**
   * Validates user credentials (username and password) and issues a JWT upon successful login.
   * @param username The username attempting to log in.
   * @param password The plain text password provided by the user.
   * @returns An object containing the access token.
   * @throws UnauthorizedException if credentials are invalid or user is not found.
   */
  async login(username: string, password?: string): Promise<{ access_token: string }> {
    this.logger.log(`Attempting login for user: '${username}'.`);
    const actor = await this.actorRepository.findOne({ where: { preferredUsername: username } }); // Changed to preferredUsername

    if (!actor) {
      this.logger.warn(`Login failed: User '${username}' not found.`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Special handling for the default 'testuser' which might not have a password hash.
    // In a production system, all users should have a password hash.
    if (actor.preferredUsername !== 'testuser') {
      if (!password) {
        this.logger.warn(`Login failed for '${username}': Password not provided.`);
        throw new UnauthorizedException('Password is required.');
      }
      if (!actor.passwordHash) {
        this.logger.warn(`Login failed for '${username}': No password hash found for this user. Account misconfigured?`);
        throw new UnauthorizedException('User account not configured for password login.');
      }
      // Compare the provided plain text password with the stored hashed password
      if (!await bcrypt.compare(password, actor.passwordHash)) {
        this.logger.warn(`Login failed for '${username}': Invalid password.`);
        throw new UnauthorizedException('Invalid credentials');
      }
    } else {
      // For 'testuser', allow login without a password.
      this.logger.log(`Allowing login for default 'testuser' without password (development mode).`);
    }

    // Create a JWT payload. 'sub' (subject) is a standard JWT claim, typically holding the user ID.
    const payload = { username: actor.preferredUsername, sub: actor.id };
    const accessToken = this.jwtService.sign(payload); // Sign the payload to create the JWT

    this.logger.log(`User '${username}' logged in successfully, issued JWT.`);
    return { access_token: accessToken };
  }

  /**
   * Registers a new user account and creates an associated ActivityPub actor.
   * @param username The desired unique username for the new user.
   * @param name The display name for the new user's ActivityPub profile.
   * @param summary A short summary/bio for the new user's ActivityPub profile.
   * @param password The plain text password for the new user (will be hashed).
   * @returns The created actor entity (public data only).
   * @throws ConflictException if the username already exists.
   */
  async register(username: string, name: string, summary: string, password: string): Promise<Partial<ActorEntity>> {
    this.logger.log(`AuthService: Attempting to register new user: '${username}'.`);
    
    // Hash the plain text password before storing it in the database.
    // A salt round of 10 is a good balance between security and performance.
    const hashedPassword = await bcrypt.hash(password, 10);

    // Use the AppService's `createActor` method to handle the creation of the ActivityPub actor,
    // which includes generating key pairs and setting up the ActivityPub profile data.
    // The `createActor` method also handles uniqueness checks for the username.
    const newActorPublicData = await this.appService.createActor(username); // Only pass username
    
    // After actor is created, update its password hash and profile data
    const actorToUpdate = await this.actorRepository.findOne({ where: { preferredUsername: username } }); // Changed to preferredUsername
    if (actorToUpdate) {
      actorToUpdate.passwordHash = hashedPassword;
      // Ensure 'data' object exists before attempting to update its properties
      if (!actorToUpdate.data) {
        actorToUpdate.data = {};
      }
      actorToUpdate.data.name = name; // Update name in data payload
      actorToUpdate.data.summary = summary; // Update summary in data payload
      await this.actorRepository.save(actorToUpdate);
    } else {
      this.logger.error(`Registered actor '${username}' not found for password/profile update.`);
      throw new Error(`Failed to find newly registered actor for update.`);
    }

    this.logger.log(`AuthService: User '${username}' registered and actor created successfully.`);
    return newActorPublicData; // Return public-facing data of the new actor
  }
}
