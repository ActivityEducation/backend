import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
