import { Entity, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn } from 'typeorm';
import { CollectionEntity } from './collection.entity';
import { ContentObjectEntity } from '../../activitypub/entities/content-object.entity';

/**
 * Join entity to link a Collection to any ContentObjectEntity.
 * This enables polymorphic collections.
 */
@Entity('collection_items')
export class CollectionItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CollectionEntity, (collection) => collection.items, {
    onDelete: 'CASCADE',
  })
  collection: CollectionEntity;

  @ManyToOne(() => ContentObjectEntity, {
    eager: true,
    onDelete: 'CASCADE',
  })
  object: ContentObjectEntity;

  @CreateDateColumn()
  createdAt: Date;
}
