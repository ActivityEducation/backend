// src/features/robots/entities/sitemap.entity.ts

import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Represents a sitemap URL to be included in the robots.txt file.
 * This allows for dynamic management of sitemap directives.
 */
@Entity('sitemaps')
export class SitemapEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string; // Internal UUID for the database record

  @Column({ unique: true })
  @Index({ unique: true })
  url: string; // The full URL of the sitemap (e.g., 'https://example.com/sitemap.xml')

  @Column({ default: true })
  isEnabled: boolean; // Whether this sitemap should be included in robots.txt

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
