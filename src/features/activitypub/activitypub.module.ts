// src/features/activitypub/activitypub.module.ts

import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ActorEntity } from './entities/actor.entity';
import { ActivityEntity } from './entities/activity.entity';
import { FollowEntity } from './entities/follow.entity';
import { ContentObjectEntity } from './entities/content-object.entity';
import { LikeEntity } from './entities/like.entity';
import { BlockEntity } from './entities/block.entity';
import { InboxProcessor } from './services/inbox.processor';
import { OutboxProcessor } from './services/outbox.processor';
import { CoreModule } from '../../core/core.module'; // Import CoreModule for AppService, RemoteObjectService, HttpModule
import { CommonModule } from '../../shared/common.module'; // Import CommonModule for shared services like KeyManagementService
import { ModerationModule } from '../moderation/moderation.module';

/**
 * ActivityPubModule
 *
 * This module encapsulates all functionalities related to the ActivityPub protocol.
 * It manages the persistence of ActivityPub entities and handles the processing
 * of incoming (inbox) and outgoing (outbox) activities using BullMQ queues.
 *
 * It imports:
 * - TypeOrmModule.forFeature: To register the ActivityPub related entities with TypeORM.
 * - BullModule.registerQueue: To set up the 'inbox' and 'outbox' message queues.
 * - CoreModule: To access core services like AppService, RemoteObjectService, and HttpModule.
 * - CommonModule: To access shared services like KeyManagementService and guards.
 *
 * It provides:
 * - InboxProcessor: Handles the processing of incoming ActivityPub activities.
 * - OutboxProcessor: Handles the processing of outgoing ActivityPub activities.
 *
 * It exports:
 * - TypeOrmModule.forFeature: To allow other modules to inject repositories for these entities.
 * - BullModule.registerQueue: To allow other modules to interact with these queues.
 * - InboxProcessor & OutboxProcessor: If other modules need to directly interact with these processors.
 */
@Module({
  imports: [
    // Register ActivityPub-related entities with TypeORM
    TypeOrmModule.forFeature([
      ActorEntity,
      ActivityEntity,
      FollowEntity,
      ContentObjectEntity,
      LikeEntity,
      BlockEntity,
    ]),
    // Register BullMQ queues for inbox and outbox processing
    // Import CoreModule to get access to AppService, RemoteObjectService, HttpModule
    CoreModule,
    // Import CommonModule to get access to shared services like KeyManagementService
    CommonModule,
    ModerationModule, // Import ModerationModule if needed for activity processing
  ],
  providers: [
    // Provide the processors responsible for handling queue jobs
    InboxProcessor,
    OutboxProcessor,
  ],
  exports: [
    // Export TypeOrmModule.forFeature to allow other modules to inject entity repositories
    TypeOrmModule.forFeature([
      ActorEntity,
      ActivityEntity,
      FollowEntity,
      ContentObjectEntity,
      LikeEntity,
      BlockEntity,
    ]),
    // Export processors if other modules need to directly interact with them
    InboxProcessor,
    OutboxProcessor,
  ],
})
export class ActivityPubModule {}
