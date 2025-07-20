// src/core/core.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { AppService } from './app.service';
import { RedisModule } from './redis.module';
import { RemoteObjectService } from './remote-object.service';
import { CommonModule } from '../shared/common.module'; // Import the new CommonModule
import { CustomLogger } from './custom-logger.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActorEntity } from 'src/features/activitypub/entities/actor.entity';
import { ActivityEntity } from 'src/features/activitypub/entities/activity.entity';
import { FollowEntity } from 'src/features/activitypub/entities/follow.entity';
import { ContentObjectEntity } from 'src/features/activitypub/entities/content-object.entity';
import { LikeEntity } from 'src/features/activitypub/entities/like.entity';
import { BlockEntity } from 'src/features/activitypub/entities/block.entity';
import { BullModule } from '@nestjs/bullmq';

/**
 * CoreModule
 *
 * This module encapsulates core application services and infrastructure
 * that are fundamental to the application's operation but are not
 * specific to any single business feature.
 *
 * It imports:
 * - ConfigModule: For configuration management.
 * - HttpModule: For making HTTP requests to external services.
 * - RedisModule: For Redis integration.
 * - CommonModule: To make shared guards, filters, services, etc., available.
 *
 * It provides and exports:
 * - AppService: The main application service.
 * - RemoteObjectService: For handling remote object interactions.
 * - CustomLogger: (If not globally provided, it should be here or in CommonModule)
 * - HttpModule: Exported for other modules to use axios.
 * - RedisModule: Exported for other modules to use Redis.
 *
 * Note: Entities and BullMQ processors (InboxProcessor, OutboxProcessor)
 * have been moved to their respective feature modules (e.g., ActivityPubModule)
 * to align with the feature-based project structure.
 * Guards and KeyManagementService are now part of CommonModule.
 */
@Module({
  imports: [
    ConfigModule, // Essential for configuration access
    HttpModule,   // For making external HTTP requests
    RedisModule,  // For Redis caching/queueing infrastructure
    CommonModule, // Provides shared components like guards, filters, and KeyManagementService
    TypeOrmModule.forFeature([
      ActorEntity,
      ActivityEntity,
      FollowEntity,
      ContentObjectEntity,
      LikeEntity,
      BlockEntity,
    ]), // Register entities for TypeORM
    BullModule.registerQueue({ name: 'inbox' }),
    BullModule.registerQueue({ name: 'outbox' }),
  ],
  providers: [
    AppService,          // Core application logic
    RemoteObjectService, // Service for fetching remote ActivityPub objects
    // CustomLogger is typically provided globally or within a specific logging module.
    // If it's not global, it could be here or in CommonModule if widely used.
    // For this refactor, assuming it's either global or handled by CommonModule.
    CustomLogger,
  ],
  exports: [
    HttpModule,          // Allow other modules to use HttpModule
    RedisModule,         // Allow other modules to use RedisModule
    AppService,          // Export AppService for other modules that need it
    RemoteObjectService, // Export RemoteObjectService for other modules
    // CustomLogger (if provided here)
    CustomLogger,
    BullModule.registerQueue({ name: 'inbox' }),
    BullModule.registerQueue({ name: 'outbox' }),
  ],
})
export class CoreModule {}

