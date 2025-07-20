// src/features/auth/auth.module.ts

import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy'; // Path updated to be within auth feature
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActorEntity } from '../activitypub/entities/actor.entity'; // Path updated to activitypub feature
import { CommonModule } from '../../shared/common.module'; // Import CommonModule for shared services like CustomLogger
import { CoreModule } from 'src/core/core.module';
import { ModerationModule } from '../moderation/moderation.module';

/**
 * AuthModule
 *
 * This module handles all authentication-related functionalities, including
 * user registration, login, and JWT token management.
 *
 * It imports:
 * - TypeOrmModule.forFeature: To register ActorEntity for user authentication.
 * - PassportModule: For Passport.js integration.
 * - JwtModule.registerAsync: To configure JWT token generation and verification
 * using the JWT secret from ConfigService.
 * - ConfigModule: To ensure ConfigService is available for JwtModule configuration.
 * - CommonModule: To access shared components like CustomLogger and potentially
 * other shared guards or services needed for authentication.
 *
 * It provides:
 * - AuthService: The main authentication service.
 * - JwtStrategy: The custom JWT Passport strategy.
 *
 * It exports:
 * - AuthService: If other modules need to use its authentication logic.
 *
 * Note: Entities like ActivityEntity, FollowEntity, ContentObjectEntity, LikeEntity,
 * and BlockEntity have been moved to the ActivityPubModule as they are specific
 * to the ActivityPub domain, not core authentication.
 * CustomLogger is now assumed to be provided via CommonModule.
 */
@Module({
  imports: [
    forwardRef(() => CoreModule), // Use forwardRef if this module is imported in a circular dependency scenario
    forwardRef(() => ModerationModule), 
    // Register ActorEntity with TypeORM for use in AuthService
    TypeOrmModule.forFeature([
      ActorEntity,
    ]),
    PassportModule, // Initialize Passport module
    // Configure JwtModule asynchronously to load JWT secret from ConfigService
    JwtModule.registerAsync({
      imports: [ConfigModule], // Import ConfigModule to access ConfigService
      inject: [ConfigService], // Inject ConfigService
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'), // Get JWT secret from environment
        signOptions: { expiresIn: '60m' }, // Token expiration time (e.g., 60 minutes)
      }),
    }),
    ConfigModule, // Import ConfigModule to ensure ConfigService is available
    CommonModule, // Import CommonModule for shared services like CustomLogger
  ],
  providers: [
    AuthService, // Authentication service
    JwtStrategy, // JWT Passport strategy
    // CustomLogger is now assumed to be provided via CommonModule, so it's removed from here.
  ],
  controllers: [AuthController], // Register authentication controller
  exports: [AuthService], // Export AuthService if other modules need to use its authentication logic
})
export class AuthModule {}
