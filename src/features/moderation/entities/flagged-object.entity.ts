import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('flagged_objects') // Defines this class as a TypeORM entity mapped to the 'flagged_objects' table
// Creates a unique composite index to prevent the same actor from flagging the same object multiple times.
// This ensures that each unique flag (object + flager) has only one record.
@Index(['objectActivityPubId', 'flagerActivityPubId'], { unique: true })
export class FlaggedObjectEntity {
  @PrimaryGeneratedColumn('uuid') // Primary key, auto-generated as a UUID
  id: string;

  @Column({ type: 'text' })
  objectActivityPubId: string; // The ActivityPub ID (URI) of the object that was flagged (e.g., a Note's ID)

  @Column({ type: 'text' })
  flagerActivityPubId: string; // The ActivityPub ID (URI) of the actor who flagged the object

  @Column({ type: 'jsonb' }) // JSONB column to store the full ActivityPub 'Flag' activity payload
  // This allows storing all details of the flag activity for moderation context.
  flagActivityData: object;

  @Column({ type: 'text', default: 'pending_review' })
  status: string; // Current status of the flagged object: 'pending_review', 'reviewed', 'dismissed', 'action_taken', etc.

  @Column({ type: 'text', nullable: true }) // Added category for flags (e.g., 'spam', 'hate_speech', 'nudity', 'harassment')
  category: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date; // Timestamp for when the flag record was created

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date; // Timestamp for the last update to the flag record
}