// src/features/robots/entities/robot-rule.entity.ts

import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Represents a single rule within a robots.txt file.
 * This entity allows for dynamic management of User-agent and Allow/Disallow directives.
 */
@Entity('robot_rules')
@Index(['userAgent', 'type', 'value'], { unique: true }) // Ensure unique rules
export class RobotRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string; // Internal UUID for the database record

  @Column({ default: '*' })
  userAgent: string; // The User-agent this rule applies to (e.g., '*', 'Googlebot')

  @Column()
  type: 'Allow' | 'Disallow'; // The type of directive

  @Column()
  value: string; // The path or URL pattern for the directive (e.g., '/', '/admin/')

  @Column({ default: 0 })
  order: number; // Order of rules for a given User-agent (lower numbers come first)

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
