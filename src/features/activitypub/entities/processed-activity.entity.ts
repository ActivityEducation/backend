// src/features/activitypub/entities/processed-activity.entity.ts

import { Entity, PrimaryColumn, CreateDateColumn, Column, Index } from 'typeorm';

/**
 * Entity to track processed ActivityPub activities for deduplication.
 * This prevents reprocessing the same activity from the Fediverse.
 *
 * The `activityId` should be the canonical ActivityPub ID (URI) of the activity.
 * This entity uses `activityId` as its primary key.
 */
@Entity('processed_activities')
// NEW: Add a composite unique index on activityId and recipientActivityPubId
// This ensures that the same activity is processed only once for a given local recipient.
// An activity without a specific recipient will have a null recipientActivityPubId.
@Index(['activityId', 'recipientActivityPubId'], { unique: true })
export class ProcessedActivityEntity {
  @PrimaryColumn({ type: 'varchar', length: 512 }) // ActivityPub IDs can be long URIs
  activityId: string; // The ActivityPub ID (URI) of the processed activity

  // NEW COLUMN: The ActivityPub URI of the local actor who received this activity.
  // This is crucial for deduplicating activities per recipient.
  // It's nullable because some activities might not have a specific local recipient (e.g., shared inbox).
  // FIX: Changed type to 'string | null' to explicitly allow null values in TypeScript.
  @Column({ type: 'text', nullable: true })
  recipientActivityPubId: string | null;

  @CreateDateColumn()
  processedAt: Date; // Timestamp when the activity was processed
}
