// src/core/core.module.ts

import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { AppService } from './services/app.service';
import { RedisModule } from './redis.module';
import { CommonModule } from '../shared/common.module'; // Import the new CommonModule
import { TypeOrmModule } from '@nestjs/typeorm'; // NEW: Import TypeOrmModule
import { ActorEntity } from 'src/features/activitypub/entities/actor.entity';
import { ActivityEntity } from 'src/features/activitypub/entities/activity.entity';
import { FollowEntity } from 'src/features/activitypub/entities/follow.entity';
import { ContentObjectEntity } from 'src/features/activitypub/entities/content-object.entity';
import { LikeEntity } from 'src/features/activitypub/entities/like.entity';
import { BlockEntity } from 'src/features/activitypub/entities/block.entity';
import { BullModule } from '@nestjs/bullmq';
import { JsonLDNamespaceController } from './controllers/namespace.controller';
import { NodeInfoController } from './controllers/nodeinfo.controller';
import { WellKnownController } from './controllers/well-known.controller';
import { UserEntity } from 'src/features/auth/entities/user.entity';
import { AnnounceEntity } from 'src/features/activitypub/entities/announce.entity';
import { ProcessedActivityEntity } from 'src/features/activitypub/entities/processed-activity.entity';
import { FlashcardEntity } from 'src/features/educationpub/entities/flashcard.entity';
import { FlashcardModelEntity } from 'src/features/educationpub/entities/flashcard-model.entity';
import { ActivityPubModule } from 'src/features/activitypub/activitypub.module';
import { KeyManagementService } from './services/key-management.service';
import { RemoteObjectService } from './services/remote-object.service';

@Module({
  imports: [
    ConfigModule, // Essential for configuration access
    HttpModule,   // For making external HTTP requests
    RedisModule,  // For Redis caching/queueing infrastructure
    CommonModule, // Provides shared components like guards, filters
    // NEW: Provide repositories needed by AppService and other core services
    TypeOrmModule.forFeature([
      FlashcardEntity,
      FlashcardModelEntity,
      ContentObjectEntity,
      ActivityEntity,
      ActorEntity,
      // The following entities are also used by services potentially injected in CoreModule
      // or are part of the core data model. Ensure all necessary entities are listed.
      FollowEntity,
      LikeEntity,
      BlockEntity,
      UserEntity,
      AnnounceEntity,
      ProcessedActivityEntity,
    ]),
    BullModule.registerQueue({ name: 'inbox' }),
    BullModule.registerQueue({ name: 'outbox' }),
    forwardRef(() => ActivityPubModule)
  ],
  controllers: [
    JsonLDNamespaceController,
    NodeInfoController,
    WellKnownController,
  ],
  providers: [
    AppService,
    RemoteObjectService,
    KeyManagementService,
  ],
  exports: [
    HttpModule,
    RedisModule,
    AppService,
    RemoteObjectService,
    KeyManagementService,
    BullModule.registerQueue({ name: 'inbox' }),
    BullModule.registerQueue({ name: 'outbox' }),
    // Export TypeOrmModule.forFeature to allow other modules to inject entity repositories
    // This is typically not needed if CoreModule is @Global() or its services are explicitly exported.
    // However, if other modules directly inject repositories that are declared here, they need to be exported.
    TypeOrmModule.forFeature([
      FlashcardEntity,
      FlashcardModelEntity,
      ContentObjectEntity,
      ActivityEntity,
      ActorEntity,
      FollowEntity,
      LikeEntity,
      BlockEntity,
      UserEntity,
      AnnounceEntity,
      ProcessedActivityEntity,
    ]),
  ],
})
export class CoreModule {}
