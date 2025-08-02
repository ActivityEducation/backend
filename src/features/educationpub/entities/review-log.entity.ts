import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { FlashcardEntity } from './flashcard.entity';
import { ActorEntity } from '../../activitypub/entities/actor.entity';

@Entity('review_logs')
export class ReviewLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => FlashcardEntity, (flashcard) => flashcard.reviewLogs)
  flashcard: FlashcardEntity;

  @ManyToOne(() => ActorEntity, (actor) => actor.reviewLogs)
  actor: ActorEntity;

  @Column({ type: 'smallint' }) // 1: Again, 2: Hard, 3: Good, 4: Easy
  rating: number;

  @Column({ type: 'jsonb', comment: "Snapshot of the memory state before the review." })
  previousState: {
    difficulty: number;
    stability: number;
    retrievability: number;
  };

  @Column({ type: 'jsonb', comment: "Snapshot of the memory state after the review." })
  state: { stability: number; difficulty: number };

  @Column()
  elapsed_time: number; // Seconds since last review

  @CreateDateColumn()
  reviewed_at: Date;

  @Column()
  scheduled_on: Date;
}
