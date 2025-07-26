// src/features/educationpub/entities/flashcard-model.entity.ts

import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('flashcard_models')
export class FlashcardModelEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index({ unique: true })
  activityPubId: string; // Canonical ActivityPub URI for the model

  @Column()
  name: string; // e.g., "Basic Vocabulary", "Image Occlusion"

  @Column({ type: 'text', nullable: true })
  summary?: string; // Description of the model

  @Column({ type: 'jsonb', default: [] })
  eduFields: Array<{ name: string; type: string; required?: boolean }>; // Defines the structure of fields (e.g., [{ name: "Front", type: "text" }])

  @Column({ type: 'jsonb', default: [] })
  eduCardTemplates: Array<{ name: string; frontTemplate: string; backTemplate: string }>; // Defines card rendering templates

  @Column({ type: 'text', nullable: true })
  eduStylingCSS?: string; // Optional CSS for styling cards

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
