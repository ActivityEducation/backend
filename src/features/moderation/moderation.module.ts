// src/features/moderation/moderation.module.ts

import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModerationService } from './moderation.service';
import { FlaggedObjectEntity } from './entities/flagged-object.entity'; // Path updated to be within moderation feature
import { CommonModule } from '../../shared/common.module';
import { CoreModule } from 'src/core/core.module';

/**
 * ModerationModule
 *
 * This module handles all functionalities related to content moderation,
 * including flagging objects and managing moderation actions.
 *
 * It imports:
 * - TypeOrmModule.forFeature: To register FlaggedObjectEntity with TypeORM.
 *
 * It provides:
 * - ModerationService: The main moderation service.
 *
 * It exports:
 * - ModerationService: So it can be used in other modules (e.g., ActivityPubModule, if it needs to interact with moderation).
 */
@Module({
  imports: [
    forwardRef(() => CoreModule), // Use forwardRef if this module is imported in a circular dependency scenario
    // Register FlaggedObjectEntity with TypeORM for use in ModerationService
    TypeOrmModule.forFeature([FlaggedObjectEntity]),
    CommonModule,
  ],
  providers: [
    ModerationService, // Moderation service
  ],
  exports: [
    ModerationService, // Export ModerationService so it can be used in other modules
  ],
})
export class ModerationModule {}
