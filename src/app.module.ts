// src/app.module.ts
// Refactored to include new entities

import { Module, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';
import * as Joi from 'joi';

// Import refactored feature modules
import { CoreModule } from './core/core.module';
import { CommonModule } from './shared/common.module'; // The new common module
import { AuthModule } from './features/auth/auth.module';
import { ModerationModule } from './features/moderation/moderation.module';
import { ActivityPubModule } from './features/activitypub/activitypub.module'; // The new ActivityPub module

// Import entities from their new feature locations
import { ActorEntity } from './features/activitypub/entities/actor.entity';
import { ActivityEntity } from './features/activitypub/entities/activity.entity';
import { FollowEntity } from './features/activitypub/entities/follow.entity';
import { ContentObjectEntity } from './features/activitypub/entities/content-object.entity';
import { LikeEntity } from './features/activitypub/entities/like.entity';
import { BlockEntity } from './features/activitypub/entities/block.entity';
import { AnnounceEntity } from './features/activitypub/entities/announce.entity'; // New AnnounceEntity
import { EducationPubModule } from './features/educationpub/educationpub.module';
import { FlashcardEntity } from './features/educationpub/entities/flashcard.entity'; // New FlashcardEntity
import { FlashcardModelEntity } from './features/educationpub/entities/flashcard-model.entity'; // New FlashcardModelEntity
import { Flashcard } from './features/educationpub/views/flashcard.view'; // Keep view if still used elsewhere, but remove from entities array if it's purely a view
import { HealthModule } from './features/health/health.module';
import { FrontendModule } from './features/frontend/frontend.module';
import { UserEntity } from './features/auth/entities/user.entity';
import { ProcessedActivityEntity } from './features/activitypub/entities/processed-activity.entity';

/**
 * AppModule
 *
 * The root module of the NestJS application. It orchestrates the
 * integration of various feature modules and sets up global configurations
 * such as environment variable loading, database connection, and message queues.
 *
 * It imports:
 * - ConfigModule: Global configuration loading and validation.
 * - BullModule: For setting up Redis-backed message queues.
 * - TypeOrmModule: For database integration.
 * - CoreModule: Contains core application services and infrastructure.
 * - CommonModule: Provides globally available shared components (guards, filters, services).
 * - AuthModule: Handles authentication functionalities.
 * - ModerationModule: Manages content moderation.
 * - ActivityPubModule: Encapsulates ActivityPub protocol logic and entities.
 *
 * It provides:
 * - Logger: NestJS's built-in Logger.
 * - 'REDIS_CLIENT': A Redis client instance for direct Redis operations.
 *
 * Note: Entities are now imported from their respective feature modules (e.g., ActivityPubModule).
 * The `TypeOrmModule.forFeature` at the root is removed as entities are registered
 * within their specific feature modules.
 */
@Module({
  imports: [
    // Configure ConfigModule to load environment variables globally from a .env file.
    // Joi validation schema ensures all necessary environment variables are present and correctly formatted.
    ConfigModule.forRoot({
      isGlobal: true, // Makes ConfigService available throughout the application
      envFilePath: '.env', // Path to the environment file
      validationSchema: Joi.object({
        // Define schema for environment variables with validation rules
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test', 'provision')
          .default('development'), // Environment type
        PORT: Joi.number().default(3000), // Application port
        INSTANCE_BASE_URL: Joi.string().uri().required(), // Base URL for the ActivityPub instance (e.g., http://localhost:3000/api)
        DB_HOST: Joi.string().required(), // PostgreSQL host
        DB_PORT: Joi.number().default(5432), // PostgreSQL port
        DB_USERNAME: Joi.string().required(), // PostgreSQL username
        DB_PASSWORD: Joi.string().required(), // PostgreSQL password
        DB_DATABASE: Joi.string().required(), // PostgreSQL database name
        REDIS_HOST: Joi.string().required(), // Redis host for BullMQ and caching
        REDIS_PORT: Joi.number().default(6379), // Redis port
        LOG_LEVEL: Joi.string()
          .valid('debug', 'log', 'warn', 'error', 'verbose')
          .default('log'), // Logging verbosity
        // JWT_SECRET must be a strong, randomly generated string of at least 32 characters for production.
        JWT_SECRET: Joi.string().min(32).required().description('JWT secret key for token signing. MUST be at least 32 characters long.'),
        // IMPORTANT: In production, this private key should be loaded from a secure Key Management System (KMS),
        // not an environment variable. This is a severe security vulnerability for production deployments.
        DEFAULT_ACTOR_PRIVATE_KEY_PEM: Joi.string().optional().allow('').description('PEM encoded private key for the default actor. For production, use a KMS.'),
      }),
    }),

    // Core application modules
    CoreModule,
    CommonModule, // Provide shared components globally or explicitly import where needed

    // Feature modules
    AuthModule,
    ModerationModule,
    ActivityPubModule, // Include the new ActivityPub feature module
    EducationPubModule,
    HealthModule,
    FrontendModule,

    // Configure TypeORM asynchronously to use ConfigService for database connection details.
    // This allows database settings to be loaded from environment variables.
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule], // Import ConfigModule to inject ConfigService
      inject: [ConfigService], // Inject ConfigService
      useFactory: (configService: ConfigService) => ({
        type: 'postgres', // Database type
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),
        // ACTION: This array should now be empty as entities are registered
        // within their respective feature modules (e.g., ActivityPubModule).
        entities: [],
        dropSchema: true, // WARNING: 'dropSchema: true' is for development only.
        synchronize: true, // WARNING: 'synchronize: true' is for development only.
                           // In production, use database migrations (e.g., TypeORM CLI commands)
                           // to manage schema changes safely and prevent data loss.
                           // Example: npm run typeorm migration:create ./src/migrations/InitialSchema
                           // Example: npm run typeorm migration:run
      }),
    }),
    // Configure BullModule for Redis connection and define message queues.
    // BullMQ uses Redis to store job data and manage queues.
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
        },
      }),
    }),
    // Remove TypeOrmModule.forFeature here as entities are now registered within feature modules.
    // TypeOrmModule.forFeature([ActorEntity, ActivityEntity, FollowEntity, ContentObjectEntity, LikeEntity, BlockEntity]),
  ],
  providers: [
    // Provide a Redis client instance for direct Redis operations (e.g., rate limiting).
    // This uses 'ioredis' for a robust Redis client.
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => new Redis({
        host: configService.get<string>('REDIS_HOST'),
        port: configService.get<number>('REDIS_PORT'),
      }),
      inject: [ConfigService], // Inject ConfigService to get Redis connection details
    },
  ],
})
export class AppModule {}
