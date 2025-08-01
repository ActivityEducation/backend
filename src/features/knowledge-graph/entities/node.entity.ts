import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Represents a node (or entity) in the knowledge graph.
 * @description This entity is designed to be generic, storing core
 * information in the 'type' column and flexible attributes
 * in the 'properties' JSONB column.
 */
@Entity('kg_nodes')
export class Node {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ comment: "The type of the entity, e.g., 'Word', 'Concept', 'Sentence'" })
  type: string;

  @Column({
    type: 'jsonb',
    default: () => "'{}'",
    comment: 'Flexible properties for the node, e.g., {"text": "perro", "language": "es"}'
  })
  properties: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}