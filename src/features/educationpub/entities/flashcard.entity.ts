// src/features/educationpub/entities/flashcard.entity.ts

import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { FlashcardModelEntity } from './flashcard-model.entity';
import { ActorEntity } from '../../activitypub/entities/actor.entity';
import { ReviewLogEntity } from './review-log.entity';
import { SpacedRepetitionScheduleEntity } from './spaced-repetition-schedule.entity';
import { ApiResponseProperty } from '@nestjs/swagger';

@Entity('flashcards')
export class FlashcardEntity {
  @PrimaryGeneratedColumn('uuid')
  @ApiResponseProperty()
  id: string;

  @Column({ unique: true })
  @Index({ unique: true })
  @ApiResponseProperty()
  activityPubId: string; // Canonical ActivityPub URI for the flashcard

  @Column()
  @ApiResponseProperty()
  name: string; // Display name of the flashcard

  @Column({ default: false })
  @ApiResponseProperty()
  isPublic: boolean; // Controls visibility; if true, it can be federated

  @Column({ type: 'text', nullable: true })
  @ApiResponseProperty()
  attributedToActivityPubId: string; // ActivityPub ID of the actor who created this flashcard

  @ManyToOne(() => ActorEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'attributedToActivityPubId', referencedColumnName: 'activityPubId' })
  creator: ActorEntity; // Relationship to the ActorEntity if local

  @Column({ type: 'uuid', nullable: true })
  @ApiResponseProperty()
  modelId: string; // Foreign key to FlashcardModelEntity

  @ManyToOne(() => FlashcardModelEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'modelId' })
  @ApiResponseProperty()
  eduModel: FlashcardModelEntity; // Relationship to the FlashcardModel

  @Column({ type: 'jsonb' })
  eduFieldsData: object; // Stores the actual data for the flashcard fields (e.g., { "Front": "Hello" })

  @Column({ type: 'jsonb', nullable: true })
  eduTags?: string[]; // Tags associated with the flashcard

  @Column({ type: 'text', nullable: true })
  eduTargetLanguage?: string; // e.g., "fr"

  @Column({ type: 'text', nullable: true })
  eduSourceLanguage?: string; // e.g., "en"

  @OneToMany(() => ReviewLogEntity, (reviewLog) => reviewLog.flashcard)
  reviewLogs: ReviewLogEntity[];

  @OneToMany(() => SpacedRepetitionScheduleEntity, (schedule) => schedule.flashcard)
  schedules: SpacedRepetitionScheduleEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt?: Date; // Soft delete timestamp
}
