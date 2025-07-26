// src/features/activitypub/entities/announce.entity.ts

import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { ActorEntity } from './actor.entity';
import { ContentObjectEntity } from './content-object.entity'; // Announce can refer to any content object

@Entity('announces')
@Index(['announcerActivityPubId', 'announcedObjectActivityPubId'], { unique: true })
export class AnnounceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  announcerActivityPubId: string; // ActivityPub ID of the actor who announced

  @ManyToOne(() => ActorEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'announcerActivityPubId', referencedColumnName: 'activityPubId' })
  announcer: ActorEntity; // Local actor who announced

  @Column({ type: 'text' })
  announcedObjectActivityPubId: string; // ActivityPub ID of the object that was announced

  @ManyToOne(() => ContentObjectEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'announcedObjectActivityPubId', referencedColumnName: 'activityPubId' })
  announcedObject: ContentObjectEntity; // The local content object that was announced (if local)

  @CreateDateColumn()
  createdAt: Date;
}
