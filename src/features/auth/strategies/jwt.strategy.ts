import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport'; // Base PassportStrategy
import { ExtractJwt, Strategy } from 'passport-jwt'; // JWT extraction and Strategy from 'passport-jwt'
import { ConfigService } from '@nestjs/config'; // For accessing environment variables
import { Repository } from 'typeorm'; // TypeORM Repository type
import { InjectRepository } from '@nestjs/typeorm'; // Decorator for injecting TypeORM repositories
import { ActorEntity } from '../../../features/activitypub/entities/actor.entity';
import { LoggerService } from 'src/shared/services/logger.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') { // 'jwt' is the strategy name
  constructor(
    configService: ConfigService,
    private readonly logger: LoggerService,
    @InjectRepository(ActorEntity) // Inject the ActorEntity repository
    private readonly actorRepository: Repository<ActorEntity>,
  ) {
    super({
      // Configure how to extract the JWT from the request (e.g., from Authorization header as Bearer token)
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Set to false to ensure tokens with expired `exp` claim are rejected.
      // Set to true only for specific testing scenarios where expiration should be ignored.
      ignoreExpiration: false, 
      // The secret key used to sign the JWT. Must match the key used during token issuance.
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
    this.logger.setContext('JwtStrategy'); // Set context for the logger
  }

  /**
   * Validates the JWT payload. This method is called after the JWT has been successfully
   * extracted and decoded. It should return a user object that will be attached to `req.user`.
   * @param payload The decoded JWT payload.
   * @returns A user object (or null if validation fails).
   */
  async validate(payload: any) {
    this.logger.debug(`Validating JWT payload for subject (actor ID): '${payload.sub}'.`);
    
    // In a real application, you would typically fetch the user from the database
    // based on the userId (payload.sub) to ensure the user still exists, is active,
    // and to retrieve up-to-date user information.
    const actor = await this.actorRepository.findOne({ where: { id: payload.sub } });

    if (!actor) {
      this.logger.warn(`JWT validation failed: Actor with ID '${payload.sub}' not found in database.`);
      return null; // Authentication failed: actor not found
    }

    this.logger.log(`JWT validated successfully for actor ID: '${payload.sub}', username: '${actor.preferredUsername}'.`);
    // The validated payload (or a more complete user object) is attached to the request (req.user).
    // This allows controllers and other guards/interceptors to easily access authenticated user data.
    return { id: actor.id, username: actor.preferredUsername, activityPubId: actor.activityPubId };
  }
}