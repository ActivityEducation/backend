import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('follows') // Defines this class as a TypeORM entity mapped to the 'follows' table
// Creates a unique composite index to ensure that an actor can only follow another actor once.
@Index(['followerActivityPubId', 'followedActivityPubId'], { unique: true })
export class FollowEntity {
  @PrimaryGeneratedColumn('uuid') // Primary key, auto-generated as a UUID
  id: string;

  @Column({ type: 'text' }) // The ActivityPub URI of the actor who initiated the follow (the follower)
  followerActivityPubId: string;

  @Column({ type: 'text' }) // The ActivityPub URI of the actor who is being followed
  followedActivityPubId: string;

  @Column({ type: 'text', default: 'pending' }) // Status of the follow: 'pending', 'accepted', 'rejected'
  // A 'pending' status indicates a follow request that needs to be accepted by the 'followed' actor.
  status: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date; // Timestamp for when the follow relationship was established
}