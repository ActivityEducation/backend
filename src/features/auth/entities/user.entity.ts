// src/features/auth/entities/user.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { ActorEntity } from '../../activitypub/entities/actor.entity';

/**
 * UserEntity
 *
 * Represents a local user of the application. This entity stores
 * user authentication details (username, hashed password) and links
 * to their associated ActivityPub Actor profile.
 */
@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  @Index({ unique: true })
  username: string;

  @Column({ length: 255 })
  @Exclude() // Exclude password from API responses by default
  passwordHash: string; // Storing hashed password (renamed from 'password')

  @Column({ type: 'text', nullable: true })
  email?: string; // Optional email for recovery/notifications

  @Column({ type: 'jsonb', default: [] })
  roles: string[]; // e.g., ['user', 'admin']

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt?: Date;

  // One-to-One relationship with ActivityPub Actor
  // Each user has exactly one ActivityPub Actor profile.
  @OneToOne(() => ActorEntity, (actor) => actor.user, {
    cascade: ['insert', 'update'], // Cascade operations to the actor entity
    onDelete: 'CASCADE', // If user is deleted, delete the associated actor
  })
  @JoinColumn({ name: 'actorId' }) // Foreign key in the users table linking to actor's ID
  actor: ActorEntity;

  // The foreign key column itself, to be able to query directly by actorId if needed
  @Column({ type: 'uuid', unique: true, nullable: true })
  actorId: string;
}
