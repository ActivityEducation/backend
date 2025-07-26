// src/features/auth/auth.service.ts

import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserEntity } from './entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { LoggerService } from 'src/shared/services/logger.service';
import { ActorService } from 'src/features/activitypub/services/actor.service'; // Import ActorService

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private usersRepository: Repository<UserEntity>,
    private jwtService: JwtService,
    private readonly logger: LoggerService,
    private readonly actorService: ActorService, // Inject ActorService
  ) {
    this.logger.setContext('AuthService');
  }

  /**
   * Registers a new user and creates an associated ActivityPub Actor.
   * @param registerDto - The registration data.
   * @returns The newly created user entity with its actor.
   */
  async register(registerDto: RegisterDto): Promise<UserEntity | null> {
    this.logger.log(`Attempting to register new user: ${registerDto.username}`);

    const existingUser = await this.usersRepository.findOne({
      where: { username: registerDto.username },
    });
    if (existingUser) {
      throw new ConflictException('Username already taken.');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Create user entity
    const newUser = this.usersRepository.create({
      username: registerDto.username,
      password: hashedPassword,
    });

    const savedUser = await this.usersRepository.save(newUser);
    this.logger.log(`User '${savedUser.username}' saved to database.`);

    // Create ActivityPub Actor for the new user
    try {
      const newActor = await this.actorService.createActorForUser(
        savedUser.id, // Pass the internal user ID
        registerDto.username,
        registerDto.name,
        registerDto.summary,
      );
      // Link the actor to the user
      savedUser.actor = newActor;
      await this.usersRepository.save(savedUser); // Save again to update the user with the linked actor
      this.logger.log(`ActivityPub Actor '${newActor.activityPubId}' created for user '${savedUser.username}'.`);
    } catch (actorError) {
      this.logger.error(
        `Failed to create ActivityPub Actor for user '${savedUser.username}': ${actorError.message}`,
        actorError.stack,
      );
      // Optionally, roll back user creation or mark user as "actor creation failed"
      // For MVP, we might log and proceed, assuming the actor creation is non-blocking.
      // For robustness, consider a transaction or a cleanup mechanism.
      throw new NotFoundException(`User created, but failed to create associated ActivityPub Actor: ${actorError.message}`);
    }

    // Load the actor relation before returning to ensure it's available
    return this.usersRepository.findOne({
      where: { id: savedUser.id },
      relations: ['actor'], // Ensure actor is loaded
    });
  }

  /**
   * Validates user credentials and returns a JWT token upon successful login.
   * @param loginDto - The login credentials.
   * @returns An object containing the JWT access token.
   */
  async login(user: UserEntity): Promise<{ access_token: string }> {
    this.logger.log(`Generating JWT for user: ${user.username}`);
    // The passport local strategy has already validated the user.
    // We just need to sign the JWT.
    const payload = { username: user.username, sub: user.id }; // 'sub' typically holds the user ID
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  /**
   * Finds a user by their internal database ID, eagerly loading their associated actor.
   * This is used by the JwtStrategy to retrieve the authenticated user.
   * @param id - The internal user ID.
   * @returns The UserEntity or undefined if not found.
   */
  async findUserById(id: string): Promise<UserEntity | null> {
    this.logger.debug(`Attempting to find user by ID: ${id}`);
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['actor'], // Eagerly load the associated actor
    });
    if (!user) {
      this.logger.warn(`User with ID '${id}' not found.`);
    }
    return user;
  }

  /**
   * Validates a user's password during login.
   * Used by the local strategy.
   * @param username - The username.
   * @param pass - The plaintext password.
   * @returns The UserEntity if credentials are valid, null otherwise.
   */
  async validateUser(username: string, pass: string): Promise<UserEntity | null> {
    this.logger.debug(`Validating credentials for user: ${username}`);
    const user = await this.usersRepository.findOne({ where: { username } });
    if (!user) {
      this.logger.warn(`User '${username}' not found during validation.`);
      return null;
    }

    const isPasswordValid = await bcrypt.compare(pass, user.password);
    if (!isPasswordValid) {
      this.logger.warn(`Invalid password for user: ${username}`);
      return null;
    }

    // Return the user without the password hash
    const { password, ...result } = user;
    return result as UserEntity;
  }
}
