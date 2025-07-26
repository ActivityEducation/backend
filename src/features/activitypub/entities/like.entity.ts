// src/features/activitypub/entities/like.entity.ts
// Updated to include relationships

import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ActorEntity } from './actor.entity'; // Import ActorEntity for relationship definition
import { ContentObjectEntity } from './content-object.entity'; // Import ContentObjectEntity for relationship definition

@Entity('likes') // Defines this class as a TypeORM entity mapped to the 'likes' table
// Creates a unique composite index to ensure that an actor can only like an object once.
@Index(['likerActivityPubId', 'likedObjectActivityPubId'], { unique: true })
export class LikeEntity {
  @PrimaryGeneratedColumn('uuid') // Primary key, auto-generated as a UUID
  id: string;

  @Column({ type: 'text' }) // The ActivityPub URI of the actor who performed the like
  likerActivityPubId: string;

  @ManyToOne(() => ActorEntity, { nullable: true, onDelete: 'SET NULL' }) // Many-to-one relationship to the local ActorEntity
  @JoinColumn({ name: 'likerActivityPubId', referencedColumnName: 'activityPubId' })
  liker: ActorEntity; // The local actor object who liked (if applicable)

  @Column({ type: 'text' }) // The ActivityPub URI of the object that was liked
  likedObjectActivityPubId: string;

  @ManyToOne(() => ContentObjectEntity, { nullable: true, onDelete: 'SET NULL' }) // Many-to-one relationship to the local ContentObjectEntity
  @JoinColumn({ name: 'likedObjectActivityPubId', referencedColumnName: 'activityPubId' })
  likedObject: ContentObjectEntity; // The local content object that was liked (if applicable)

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date; // Timestamp for when the like relationship was established
}
