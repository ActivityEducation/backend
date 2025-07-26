// src/features/auth/strategies/jwt.strategy.ts

import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { LoggerService } from 'src/shared/services/logger.service';
import { UserEntity } from '../entities/user.entity'; // Import UserEntity

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
    private readonly logger: LoggerService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'), // Ensure this matches the secret used for signing
    });
    this.logger.setContext('JwtStrategy');
  }

  /**
   * The 'validate' method is called after the JWT is successfully decrypted.
   * It receives the decoded JWT payload.
   * It should return the user object that will be attached to the request (req.user).
   *
   * @param payload The decoded JWT payload. Expected to contain 'sub' (userId) and 'username'.
   * @returns The validated UserEntity (with actor relation loaded).
   * @throws UnauthorizedException if the user is not found or validation fails.
   */
  async validate(payload: { sub: string; username: string }): Promise<UserEntity> {
    this.logger.debug(`Attempting to validate JWT payload for user: ${payload.username} (ID: ${payload.sub})`);

    // Use AuthService to find the user by ID.
    // AuthService.findUserById should now eagerly load the 'actor' relation.
    const user = await this.authService.findUserById(payload.sub);

    if (!user) {
      this.logger.warn(`User with ID '${payload.sub}' (username: ${payload.username}) not found during JWT validation.`);
      throw new UnauthorizedException('User not found.');
    }

    // Log the successful validation.
    this.logger.log(`JWT validated successfully for user: ${user.username} (ID: ${user.id}). Actor ID: ${user.actor?.activityPubId || 'N/A'}`);

    // Return the full UserEntity. This object will be attached to `req.user`
    // and can be accessed in controllers using `@UserDecorator() user: UserEntity`.
    return user;
  }
}
