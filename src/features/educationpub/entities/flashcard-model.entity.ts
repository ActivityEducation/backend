import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ActorEntity } from '../../activitypub/entities/actor.entity';

@Entity('flashcard_models')
export class FlashcardModelEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index({ unique: true })
  activityPubId: string; // Canonical ActivityPub URI for the model

  @Column()
  name: string;

  @Column({ nullable: true })
  summary?: string;

  @Column({ type: 'json' })
  fields: { id: string; name: string; type: 'text' | 'image' | 'audio' | 'icon' }[];

  @Column({ type: 'json' })
  cardTemplates: {
    id: string;
    name: string;
    layout: {
      fieldId: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }[];
  }[];

  @Column({ type: 'text', nullable: true })
  attributedToActivityPubId: string; // ActivityPub ID of the actor who created this model

  @ManyToOne(() => ActorEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'attributedToActivityPubId', referencedColumnName: 'activityPubId' })
  creator: ActorEntity; // Relationship to the ActorEntity

  @Column({ default: false })
  isPublic: boolean; // Add a flag to control visibility

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
