// src/features/auth/auth.service.ts
// Updated to integrate with ActorService for ActivityPub Actor creation

import { Injectable, ConflictException, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ActorService } from '../activitypub/services/actor.service'; // Import ActorService
import { UserEntity } from './entities/user.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    private jwtService: JwtService,
    private actorService: ActorService, // Inject ActorService
  ) {}

  async register(registerDto: RegisterDto): Promise<{ message: string, user: UserEntity }> {
    const { username, password, name, summary } = registerDto;
    this.logger.log(`Attempting to register new user: ${username}`);

    const existingUser = await this.userRepository.findOne({ where: { username } });
    if (existingUser) {
      this.logger.warn(`Registration failed: Username '${username}' already exists.`);
      throw new ConflictException('Username already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = this.userRepository.create({
      username,
      password: hashedPassword,
    });

    const savedUser = await this.userRepository.save(newUser);
    this.logger.log(`User '${username}' registered successfully. User ID: ${savedUser.id}`);

    // Create ActivityPub Actor for the new user
    try {
      await this.actorService.createActorForUser(savedUser.id, username, name, summary);
      this.logger.log(`ActivityPub Actor created for user '${username}'.`);
    } catch (actorCreationError) {
      this.logger.error(`Failed to create ActivityPub Actor for user '${username}': ${actorCreationError.message}`, actorCreationError.stack);
      // Decide how to handle this: rollback user creation or log and allow partial success.
      // For MVP, we'll log the error and proceed, but this should be hardened.
      // throw new InternalServerErrorException('User registered but failed to create ActivityPub actor.');
    }

    return { user: savedUser, message: 'User registered successfully!' };
  }

  async login(loginDto: LoginDto): Promise<{ access_token: string }> {
    const { username, password } = loginDto;
    this.logger.log(`Attempting to log in user: ${username}`);

    const user = await this.userRepository.findOne({ where: { username } });
    if (!user) {
      this.logger.warn(`Login failed: User '${username}' not found.`);
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      this.logger.warn(`Login failed: Invalid password for user '${username}'.`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Get the associated actor
    const actor = await this.actorService.findActorById(user.actorId);
    if (!actor) {
        this.logger.error(`Login error: User '${username}' has no associated ActivityPub actor.`);
        throw new UnauthorizedException('User profile incomplete: No associated ActivityPub actor.');
    }

    const payload = { username: user.username, sub: user.id, actorId: actor.id }; // Include actorId in JWT payload
    const accessToken = this.jwtService.sign(payload);
    this.logger.log(`User '${username}' logged in successfully. Issued JWT.`);

    return { access_token: accessToken };
  }
}
