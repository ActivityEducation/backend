import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('blocks') // Defines this class as a TypeORM entity mapped to the 'blocks' table
// Creates a unique composite index to ensure that an actor can only block another actor once.
@Index(['blockerActivityPubId', 'blockedActivityPubId'], { unique: true })
export class BlockEntity {
  @PrimaryGeneratedColumn('uuid') // Primary key, auto-generated as a UUID
  id: string;

  @Column({ type: 'text' }) // The ActivityPub URI of the actor who initiated the block
  blockerActivityPubId: string;

  @Column({ type: 'text' }) // The ActivityPub URI of the actor who is being blocked
  blockedActivityPubId: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date; // Timestamp for when the block relationship was established
}