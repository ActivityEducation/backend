import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { Node } from './node.entity';

/**
 * Represents an edge (or relationship) between two nodes in the knowledge graph.
 */
@Entity('kg_edges')
@Index(['sourceId', 'targetId', 'type'], { unique: true })
export class Edge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ comment: "The type of the relationship, e.g., 'synonym_of', 'represents'" })
  type: string;

  @Column({
    type: 'jsonb',
    default: () => "'{}'",
    comment: 'Flexible properties for the edge, e.g., {"source": "manual_entry"}'
  })
  properties: Record<string, any>;

  @ManyToOne(() => Node, { onDelete: 'CASCADE' })
  source: Node;

  @Index()
  @Column()
  sourceId: string;

  @ManyToOne(() => Node, { onDelete: 'CASCADE' })
  target: Node;

  @Index()
  @Column()
  targetId: string;

  @CreateDateColumn()
  createdAt: Date;
}