import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Unique } from 'typeorm';
import { FlashcardEntity } from './flashcard.entity';
import { ActorEntity } from '../../activitypub/entities/actor.entity';
import { ApiResponseProperty } from '@nestjs/swagger';

@Entity('spaced_repetition_schedules')
@Unique(['actor', 'flashcard'])
export class SpacedRepetitionScheduleEntity {
  @PrimaryGeneratedColumn('uuid')
  @ApiResponseProperty()
  id: string;

  @ManyToOne(() => ActorEntity, (actor) => actor.schedules, { eager: true })
  @ApiResponseProperty({ type: () => ActorEntity })
  actor: ActorEntity;

  @ManyToOne(() => FlashcardEntity, (flashcard) => flashcard.schedules, { eager: true })
  @ApiResponseProperty({ type: () => FlashcardEntity })
  flashcard: FlashcardEntity;

  @Column({ type: 'timestamp with time zone' })
  @ApiResponseProperty()
  due: Date;

  @Column('float')
  @ApiResponseProperty()
  stability: number;

  @Column('float')
  @ApiResponseProperty()
  difficulty: number;

  @Column({ default: 0 })
  @ApiResponseProperty()
  lapses: number;

  @Column({ default: 'New' }) // New, Learning, Review
  @ApiResponseProperty()
  state: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  @ApiResponseProperty()
  last_review: Date;
}