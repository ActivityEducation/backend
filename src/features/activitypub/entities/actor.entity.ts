// src/features/activitypub/entities/actor.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '../../auth/entities/user.entity'; // Import UserEntity
import { Exclude } from 'class-transformer'; // NEW: Import Exclude

/**
 * Represents an ActivityPub Actor (e.g., as:Person, as:Application).
 * This entity stores information about both local and remote actors.
 */
@Entity('actors')
export class ActorEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string; // Internal UUID for the database record

  @Column({ unique: true })
  @Index({ unique: true })
  activityPubId: string; // The canonical ActivityPub URI of the actor (e.g., https://example.com/users/alice)

  @Column({ unique: true })
  @Index({ unique: true })
  preferredUsername: string; // The user's chosen username (e.g., 'alice')

  @Column({ nullable: true })
  name?: string; // Display name of the actor

  @Column({ type: 'text', nullable: true })
  summary?: string; // Bio or description of the actor

  @Column()
  inbox: string; // URI of the actor's inbox

  @Column()
  outbox: string; // URI of the actor's outbox

  @Column({ nullable: true })
  followersUrl?: string; // URI of the actor's followers collection

  @Column({ nullable: true })
  followingUrl?: string; // URI of the actor's following collection

  @Column({ nullable: true })
  likedUrl?: string; // URI of the actor's liked collection

  @Column({ type: 'text', nullable: true })
  publicKeyPem?: string; // PEM-encoded public key of the actor

  // IMPORTANT: For production, privateKeyPem MUST be stored securely in a KMS like HashiCorp Vault.
  // For development, it's temporarily here. Ensure it's not exposed.
  // FIX: Re-added @Exclude() to prevent privateKeyPem from being returned in API responses.
  @Column({ type: 'text', nullable: true })
  @Exclude() // Exclude privateKeyPem from API responses
  privateKeyPem?: string; // PEM-encoded private key of the actor (for local actors)

  @Column({ default: true })
  isLocal: boolean; // True if this is a local actor, false if remote

  @OneToOne(() => UserEntity, user => user.actor, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn()
  user?: UserEntity; // Optional one-to-one relationship with a local UserEntity

  @Column({ type: 'jsonb', nullable: true })
  data?: object; // Full JSON-LD payload of the ActivityPub actor profile

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
