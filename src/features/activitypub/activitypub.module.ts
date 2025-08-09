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
import { ProcessedActivityEntity } from './entities/processed-activity.entity';
import { InboxProcessor } from './services/inbox.processor';
import { CoreModule } from '../../core/core.module';
import { CommonModule } from '../../shared/common.module';
import { ModerationModule } from '../moderation/moderation.module';
import { ActivityHandlerModule } from './activity-handler/handler.module';
import { ActivityPubController } from './controllers/activitypub.controller';
import { ActorService } from './services/actor.service';
import { UserEntity } from '../auth/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { HttpModule } from '@nestjs/axios'; // NEW: Import HttpModule
import { OutboxProcessor } from './services/outbox.processor';

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
      ProcessedActivityEntity,
      UserEntity, // Register UserEntity as well, if ActorService depends on it here
    ]),
    // Register BullMQ queues for inbox and outbox processing
    BullModule.registerQueue({
      name: 'inbox',
    }),
    BullModule.registerQueue({
      name: 'outbox',
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    }),
    forwardRef(() => CoreModule),
    CommonModule,
    ModerationModule,
    AuthModule,
    HttpModule, // NEW: Add HttpModule to imports
  ],
  providers: [
    InboxProcessor,
    OutboxProcessor,
    ActorService,
  ],
  controllers: [
    ActivityPubController
  ],
  exports: [
    TypeOrmModule.forFeature([
      ActorEntity,
      ActivityEntity,
      FollowEntity,
      ContentObjectEntity,
      LikeEntity,
      BlockEntity,
      AnnounceEntity,
      ProcessedActivityEntity,
    ]),
    InboxProcessor,
    OutboxProcessor,
    ActorService,
  ],
})
export class ActivityPubModule {}
