// src/features/moderation/moderation.module.ts

import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModerationService } from './moderation.service';
import { FlaggedObjectEntity } from './entities/flagged-object.entity'; // Path updated to be within moderation feature
import { CommonModule } from '../../shared/common.module'; // Import CommonModule for shared services like CustomLogger
import { CoreModule } from 'src/core/core.module';

/**
 * ModerationModule
 *
 * This module handles all functionalities related to content moderation,
 * including flagging objects and managing moderation actions.
 *
 * It imports:
 * - TypeOrmModule.forFeature: To register FlaggedObjectEntity with TypeORM.
 * - CommonModule: To access shared components like CustomLogger.
 *
 * It provides:
 * - ModerationService: The main moderation service.
 *
 * It exports:
 * - ModerationService: So it can be used in other modules (e.g., ActivityPubModule, if it needs to interact with moderation).
 *
 * Note: CustomLogger is now assumed to be provided via CommonModule.
 */
@Module({
  imports: [
    forwardRef(() => CoreModule), // Use forwardRef if this module is imported in a circular dependency scenario
    // Register FlaggedObjectEntity with TypeORM for use in ModerationService
    TypeOrmModule.forFeature([FlaggedObjectEntity]),
    CommonModule, // Import CommonModule for shared services like CustomLogger
  ],
  providers: [
    ModerationService, // Moderation service
    // CustomLogger is now assumed to be provided via CommonModule, so it's removed from here.
  ],
  exports: [
    ModerationService, // Export ModerationService so it can be used in other modules
  ],
})
export class ModerationModule {}
