// src/features/activitypub/entities/content-object.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ActorEntity } from './actor.entity'; // Import ActorEntity

/**
 * Represents a generic ActivityPub content object (e.g., Note, Article, Image, Video, edu:Flashcard, etc.).
 * This entity is used to store both locally created and remotely fetched content objects
 * to maintain a local cache and relationships.
 */
@Entity('content_objects')
export class ContentObjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string; // Internal UUID for the database record

  @Column({ unique: true })
  @Index({ unique: true })
  activityPubId: string; // The canonical ActivityPub URI of the object (e.g., https://example.com/notes/123)

  @Column()
  type: string; // The ActivityStreams type of the object (e.g., 'Note', 'Image', 'edu:Flashcard')

  @Column({ type: 'text', nullable: true })
  attributedToActivityPubId: string; // The ActivityPub ID of the actor who created/attributed this object

  @ManyToOne(() => ActorEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'attributedToActivityPubId', referencedColumnName: 'activityPubId' })
  attributedTo: ActorEntity; // Relationship to the local ActorEntity if the creator is local

  @Column({ type: 'text', nullable: true })
  inReplyToActivityPubId?: string; // The ActivityPub ID of the object this is a reply to

  // Added to explicitly store the 'updated' timestamp from the ActivityPub object
  @Column({ type: 'timestamp with time zone', nullable: true })
  activityPubUpdatedAt?: Date; // Timestamp from the ActivityPub 'updated' property on the object

  @Column({ type: 'jsonb' })
  data: object; // The full JSON-LD payload of the ActivityPub object

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date; // TypeORM's internal update timestamp for the entity record
}
