import { Module, Global, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { AppService } from './services/app.service';
import { RedisModule } from './redis.module';
import { CommonModule } from '../shared/common.module';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { HttpSignatureVerificationGuard } from '../shared/guards/http-signature-verification.guard'; // NEW: Import HttpSignatureVerificationGuard
import { RateLimitGuard } from '../shared/guards/rate-limit.guard'; // NEW: Import RateLimitGuard

@Global() // CoreModule is typically global for foundational services
@Module({
  imports: [
    ConfigModule,
    HttpModule,
    RedisModule,
    CommonModule, // Provides shared components like LoggerService
    TypeOrmModule.forFeature([
      ActorEntity,
      ActivityEntity,
      FollowEntity,
      ContentObjectEntity,
      LikeEntity,
      BlockEntity,
      UserEntity,
      AnnounceEntity,
      FlashcardEntity,
      FlashcardModelEntity,
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
    HttpSignatureVerificationGuard, // NEW: Provide HttpSignatureVerificationGuard here
    RateLimitGuard, // NEW: Provide RateLimitGuard here
  ],
  exports: [
    HttpModule,
    RedisModule,
    AppService,
    RemoteObjectService,
    KeyManagementService,
    BullModule.registerQueue({ name: 'inbox' }),
    BullModule.registerQueue({ name: 'outbox' }),
    HttpSignatureVerificationGuard, // NEW: Export HttpSignatureVerificationGuard here
    RateLimitGuard, // NEW: Export RateLimitGuard here
    // Export TypeOrmModule.forFeature is generally not needed if CoreModule is @Global()
    // or its services are explicitly exported and consume the repositories.
    // If other modules directly inject these specific repositories, they need to be exported.
    TypeOrmModule.forFeature([
      ActorEntity,
      ActivityEntity,
      FollowEntity,
      ContentObjectEntity,
      LikeEntity,
      BlockEntity,
      UserEntity,
      AnnounceEntity,
      FlashcardEntity,
      FlashcardModelEntity,
      ProcessedActivityEntity,
    ]),
  ],
})
export class CoreModule {}
