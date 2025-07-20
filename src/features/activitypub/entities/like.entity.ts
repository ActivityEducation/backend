import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('likes') // Defines this class as a TypeORM entity mapped to the 'likes' table
// Creates a unique composite index to ensure that an actor can only like an object once.
@Index(['likerActivityPubId', 'likedObjectActivityPubId'], { unique: true })
export class LikeEntity {
  @PrimaryGeneratedColumn('uuid') // Primary key, auto-generated as a UUID
  id: string;

  @Column({ type: 'text' }) // The ActivityPub URI of the actor who performed the like
  likerActivityPubId: string;

  @Column({ type: 'text' }) // The ActivityPub URI of the object that was liked
  likedObjectActivityPubId: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date; // Timestamp for when the like relationship was established
}