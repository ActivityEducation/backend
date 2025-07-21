import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { HandlerDiscoveryService } from './handler-discovery.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEntity } from '../entities/activity.entity';
import { FollowEntity } from '../entities/follow.entity';
import { ContentObjectEntity } from '../entities/content-object.entity';
import { LikeEntity } from '../entities/like.entity';
import { BlockEntity } from '../entities/block.entity';
import { CoreModule } from 'src/core/core.module';
import { FollowHandler } from './handlers/follow.handler';
import { ActorEntity } from '../entities/actor.entity';
import { CreateHandler } from './handlers/create.handler';
import { AnnounceHandler } from './handlers/announce.handler';
import { LikeHandler } from './handlers/like.handler';
import { BlockHandler } from './handlers/block.handler';
import { DeleteHandler } from './handlers/delete.handler';
import { UpdateHandler } from './handlers/update.handler';
import { MoveHandler } from './handlers/move.handler';
import { FlagHandler } from './handlers/flag.handler';
import { AcceptHandler } from './handlers/accept.handler';
import { RejectHandler } from './handlers/reject.handler';
import { ModerationModule } from 'src/features/moderation/moderation.module';
import { UndoHandler } from './handlers/undo.handler';

@Module({
  imports: [
    CoreModule,
    ModerationModule,
    TypeOrmModule.forFeature([
      ActorEntity,
      ActivityEntity,
      FollowEntity,
      ContentObjectEntity,
      LikeEntity,
      BlockEntity,
    ]),
    DiscoveryModule,
  ],
  providers: [
    HandlerDiscoveryService,
    
    // Registering the activity handlers
    FollowHandler,
    CreateHandler,
    AnnounceHandler,
    LikeHandler,
    BlockHandler,
    DeleteHandler,
    UpdateHandler,
    MoveHandler,
    FlagHandler,
    AcceptHandler,
    RejectHandler,
    UndoHandler,
  ],
  exports: [DiscoveryModule, HandlerDiscoveryService],
})
export class ActivityHandlerModule {}
