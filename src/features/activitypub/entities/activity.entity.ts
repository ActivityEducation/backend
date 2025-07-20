import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ActorEntity } from './actor.entity'; // Import ActorEntity for relationship definition

@Entity('activities') // Defines this class as a TypeORM entity mapped to the 'activities' table
export class ActivityEntity {
  @PrimaryGeneratedColumn('uuid') // Primary key, auto-generated as a UUID
  id: string;

  @Column({ unique: true }) // The ActivityPub 'id' URI for the activity, must be unique globally
  @Index({ unique: true }) // Creates a unique database index on this column for efficient lookups
  activityPubId: string;

  @Column() // The type of the activity (e.g., 'Create', 'Like', 'Follow', 'Announce', 'Delete')
  type: string;

  @Column({ nullable: true }) // The ID of the local actor who performed this activity (if it originated locally)
  actorId: string;

  @ManyToOne(() => ActorEntity, { nullable: true, onDelete: 'SET NULL' }) // Many-to-one relationship to the local ActorEntity
  @JoinColumn({ name: 'actorId' }) // Specifies the foreign key column in this table
  actor: ActorEntity; // The local actor object (if applicable)

  @Column({ type: 'text', nullable: true }) // The ActivityPub URI of the actor who performed the activity (can be remote)
  actorActivityPubId: string;

  @Column({ type: 'text', nullable: true }) // The ActivityPub URI of the object of the activity (e.g., the Note being created, the Actor being followed)
  objectActivityPubId: string;

  @Column({ type: 'text', nullable: true }) // The ActivityPub URI of the object this activity is in reply to (for replies)
  inReplyToActivityPubId?: string;

  @Column({ type: 'jsonb' }) // JSONB column to store the full ActivityPub JSON-LD payload of the activity
  // This allows for flexible storage of all ActivityPub properties without a rigid schema.
  data: any;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date; // Timestamp for when the activity record was created

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date; // Timestamp for the last update to the activity record

  @Column({ type: 'timestamp', nullable: true }) // Soft delete timestamp. If set, the activity is considered "deleted"
  // but not physically removed from the database. This is useful for `Delete` activities in ActivityPub.
  deletedAt?: Date;
}