import { ChildEntity, Column, OneToMany } from 'typeorm';
import { ContentObjectEntity } from '../../activitypub/entities/content-object.entity';
import { CollectionItemEntity } from './collection-item.entity';

export enum CollectionVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

/**
 * Represents a collection that can hold various types of federated objects.
 */
@ChildEntity('Collection')
export class CollectionEntity extends ContentObjectEntity {
  @Column()
  name: string;

  @Column('text')
  description: string;

  @Column({
    type: 'enum',
    enum: CollectionVisibility,
    default: CollectionVisibility.PRIVATE,
  })
  visibility: CollectionVisibility;

  @OneToMany(() => CollectionItemEntity, (item) => item.collection, {
    cascade: true,
  })
  items: CollectionItemEntity[];
}
