// src/features/activitypub/entities/processed-activity.entity.ts

import { Entity, PrimaryColumn, CreateDateColumn } from 'typeorm';

/**
 * Entity to track processed ActivityPub activities for deduplication.
 * This prevents reprocessing the same activity from the Fediverse.
 *
 * The `activityId` should be the canonical ActivityPub ID (URI) of the activity.
 * This entity uses `activityId` as its primary key.
 */
@Entity('processed_activities')
export class ProcessedActivityEntity {
  @PrimaryColumn({ type: 'varchar', length: 512 }) // ActivityPub IDs can be long URIs
  activityId: string; // The ActivityPub ID (URI) of the processed activity

  @CreateDateColumn()
  processedAt: Date; // Timestamp when the activity was processed
}
