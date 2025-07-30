import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Unique } from 'typeorm';
import { FlashcardEntity } from './flashcard.entity';
import { ActorEntity } from '../../activitypub/entities/actor.entity';

@Entity('spaced_repetition_schedules')
@Unique(['actor', 'flashcard'])
export class SpacedRepetitionScheduleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ActorEntity, (actor) => actor.schedules, { eager: true })
  actor: ActorEntity;

  @ManyToOne(() => FlashcardEntity, (flashcard) => flashcard.schedules, { eager: true })
  flashcard: FlashcardEntity;

  @Column({ type: 'timestamp with time zone' })
  due: Date;

  @Column('float')
  stability: number;

  @Column('float')
  difficulty: number;

  @Column({ default: 0 })
  lapses: number;

  @Column({ default: 'New' }) // New, Learning, Review
  state: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  last_review: Date;
}