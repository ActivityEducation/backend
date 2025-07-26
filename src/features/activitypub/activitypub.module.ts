// src/features/activitypub/activitypub.module.ts
// Updated to include new entity and ActorService

import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ActorEntity } from './entities/actor.entity';
import { ActivityEntity } from './entities/activity.entity';
import { FollowEntity } from './entities/follow.entity';
import { ContentObjectEntity } from './entities/content-object.entity';
import { LikeEntity } from './entities/like.entity';
import { BlockEntity } from './entities/block.entity';
import { AnnounceEntity } from './entities/announce.entity';
import { ProcessedActivityEntity } from './entities/processed-activity.entity'; // Import new ProcessedActivityEntity
import { InboxProcessor } from './services/inbox.processor';
import { OutboxProcessor } from './services/outbox.processor';
import { CoreModule } from '../../core/core.module';
import { CommonModule } from '../../shared/common.module';
import { ModerationModule } from '../moderation/moderation.module';
import { ActivityHandlerModule } from './activity-handler/handler.module';
import { ActivityPubController } from './controllers/activitypub.controller';
import { ActorService } from './services/actor.service'; // Import new ActorService
import { UserEntity } from '../auth/entities/user.entity';

@Module({
  imports: [
    forwardRef(() => ActivityHandlerModule),
    // Register ActivityPub-related entities with TypeORM
    TypeOrmModule.forFeature([
      ActorEntity,
      ActivityEntity,
      FollowEntity,
      ContentObjectEntity,
      LikeEntity,
      BlockEntity,
      AnnounceEntity,
      ProcessedActivityEntity, // Register new ProcessedActivityEntity
      UserEntity, // Register UserEntity as well, if ActorService depends on it here
    ]),
    // Register BullMQ queues for inbox and outbox processing
    BullModule.registerQueue({
      name: 'inbox',
    }),
    BullModule.registerQueue({
      name: 'outbox',
    }),
    forwardRef(() => CoreModule),
    CommonModule,
    ModerationModule, // Import ModerationModule if needed for activity processing
  ],
  providers: [
    // Provide the processors responsible for handling queue jobs
    InboxProcessor,
    OutboxProcessor,
    ActorService, // Provide ActorService
  ],
  controllers: [
    ActivityPubController
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
      AnnounceEntity,
      ProcessedActivityEntity, // Export new ProcessedActivityEntity
    ]),
    // Export processors if other modules need to directly interact with them
    InboxProcessor,
    OutboxProcessor,
    ActorService, // Export ActorService
  ],
})
export class ActivityPubModule {}
