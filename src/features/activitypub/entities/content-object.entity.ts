import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ActorEntity } from './actor.entity'; // Import ActorEntity for potential relationship (attributedTo)

@Entity('content_objects') // Defines this class as a TypeORM entity mapped to the 'content_objects' table
export class ContentObjectEntity {
  @PrimaryGeneratedColumn('uuid') // Primary key, auto-generated as a UUID
  id: string;

  @Column({ unique: true }) // The ActivityPub 'id' URI for the content object, must be unique globally
  @Index({ unique: true }) // Creates a unique database index on this column for efficient lookups
  activityPubId: string;

  @Column() // The type of the content object (e.g., 'Note', 'Image', 'Video', 'Article', 'Question')
  type: string;

  @Column({ type: 'text', nullable: true }) // The ActivityPub URI of the actor who attributed this content (e.g., the author)
  attributedToActivityPubId: string;

  @Column({ type: 'text', nullable: true }) // The ActivityPub URI of the object this content is in reply to (for replies)
  inReplyToActivityPubId?: string;

  @Column({ type: 'text', nullable: true }) // URL for the collection of shares (Announce activities) for this object
  // This could be used to track how many times an object has been announced/re-shared.
  sharesCollectionId?: string;

  @Column({ type: 'jsonb' }) // JSONB column to store the full ActivityPub JSON-LD payload of the content object
  // This provides schema flexibility for various content object types and their properties.
  data: any;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date; // Timestamp for when the content object record was created

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date; // Timestamp for the last update to the content object record

  @Column({ type: 'timestamp', nullable: true }) // Soft delete timestamp. If set, the object is considered "deleted"
  // but not physically removed. Useful for `Delete` activities in ActivityPub.
  deletedAt?: Date;
}