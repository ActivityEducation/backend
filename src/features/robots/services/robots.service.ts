// src/features/robots/services/robots.service.ts

import { Injectable, NotFoundException } from '@nestjs/common'; // NEW: Import NotFoundException
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RobotRuleEntity } from '../entities/robot-rule.entity';
import { SitemapEntity } from '../entities/sitemap.entity';
import { LoggerService } from 'src/shared/services/logger.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RobotsService {
  private readonly instanceBaseUrl: string;

  constructor(
    @InjectRepository(RobotRuleEntity)
    private readonly robotRuleRepository: Repository<RobotRuleEntity>,
    @InjectRepository(SitemapEntity)
    private readonly sitemapRepository: Repository<SitemapEntity>,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    this.logger.setContext('RobotsService');
    this.instanceBaseUrl = this.configService.get<string>('INSTANCE_BASE_URL')!;
  }

  /**
   * Generates the content for the robots.txt file based on stored rules and sitemaps.
   * @returns The robots.txt file content as a string.
   */
  async generateRobotsTxtContent(): Promise<string> {
    this.logger.debug('Generating robots.txt content from database.');

    const rules = await this.robotRuleRepository.find({
      order: { userAgent: 'ASC', order: 'ASC' }, // Order by user-agent, then custom order
    });

    const sitemaps = await this.sitemapRepository.find({
      where: { isEnabled: true },
    });

    let content = '';
    let currentUserAgent: string | null = null;

    // Group rules by User-agent
    for (const rule of rules) {
      if (rule.userAgent !== currentUserAgent) {
        if (currentUserAgent !== null) {
          content += '\n'; // Add a newline between different user-agent blocks
        }
        content += `User-agent: ${rule.userAgent}\n`;
        currentUserAgent = rule.userAgent;
      }
      content += `${rule.type}: ${rule.value}\n`;
    }

    // Add Sitemaps
    if (sitemaps.length > 0) {
      if (content.length > 0) {
        content += '\n'; // Add a newline before sitemaps if there are rules
      }
      for (const sitemap of sitemaps) {
        content += `Sitemap: ${sitemap.url}\n`;
      }
    } else {
      // Fallback to default sitemap if no sitemaps are configured
      content += `Sitemap: ${this.instanceBaseUrl || 'http://localhost'}/sitemap.xml\n`;
    }

    this.logger.debug('Robots.txt content generated.');
    return content.trim(); // Trim any leading/trailing whitespace
  }

  // --- CRUD operations for RobotRuleEntity ---

  async createRule(userAgent: string, type: 'Allow' | 'Disallow', value: string, order: number = 0): Promise<RobotRuleEntity> {
    const newRule = this.robotRuleRepository.create({ userAgent, type, value, order });
    return this.robotRuleRepository.save(newRule);
  }

  async findAllRules(): Promise<RobotRuleEntity[]> {
    return this.robotRuleRepository.find({ order: { userAgent: 'ASC', order: 'ASC' } });
  }

  /**
   * Finds a robot rule by its ID.
   * @param id The UUID of the robot rule.
   * @returns The RobotRuleEntity if found.
   * @throws NotFoundException if the rule is not found.
   */
  async findRuleById(id: string): Promise<RobotRuleEntity> {
    this.logger.debug(`Finding robot rule by ID: ${id}`);
    const rule = await this.robotRuleRepository.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException(`Robot rule with ID '${id}' not found.`);
    }
    return rule;
  }

  async updateRule(id: string, updates: Partial<RobotRuleEntity>): Promise<RobotRuleEntity> {
    const rule = await this.robotRuleRepository.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException('Rule not found'); // Changed to NotFoundException
    }
    Object.assign(rule, updates);
    return this.robotRuleRepository.save(rule);
  }

  async deleteRule(id: string): Promise<void> {
    const result = await this.robotRuleRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Robot rule with ID '${id}' not found.`);
    }
  }

  // --- CRUD operations for SitemapEntity ---

  async createSitemap(url: string, isEnabled: boolean = true): Promise<SitemapEntity> {
    const newSitemap = this.sitemapRepository.create({ url, isEnabled });
    return this.sitemapRepository.save(newSitemap);
  }

  async findAllSitemaps(): Promise<SitemapEntity[]> {
    return this.sitemapRepository.find();
  }

  /**
   * Finds a sitemap entry by its ID.
   * @param id The UUID of the sitemap entry.
   * @returns The SitemapEntity if found.
   * @throws NotFoundException if the sitemap is not found.
   */
  async findSitemapById(id: string): Promise<SitemapEntity> {
    this.logger.debug(`Finding sitemap by ID: ${id}`);
    const sitemap = await this.sitemapRepository.findOne({ where: { id } });
    if (!sitemap) {
      throw new NotFoundException(`Sitemap with ID '${id}' not found.`);
    }
    return sitemap;
  }

  async updateSitemap(id: string, updates: Partial<SitemapEntity>): Promise<SitemapEntity> {
    const sitemap = await this.sitemapRepository.findOne({ where: { id } });
    if (!sitemap) {
      throw new NotFoundException('Sitemap not found'); // Changed to NotFoundException
    }
    Object.assign(sitemap, updates);
    return this.sitemapRepository.save(sitemap);
  }

  async deleteSitemap(id: string): Promise<void> {
    const result = await this.sitemapRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Sitemap with ID '${id}' not found.`);
    }
  }
}
