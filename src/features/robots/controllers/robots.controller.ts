// src/features/robots/controllers/robots.controller.ts
import { Controller, Get, Header, Res, Post, Body, Param, Put, Delete, HttpCode, HttpStatus, NotFoundException, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { LoggerService } from 'src/shared/services/logger.service';
import { RobotsService } from '../services/robots.service';
import { CreateRobotRuleDto } from '../dto/create-robot-rule.dto';
import { UpdateRobotRuleDto } from '../dto/update-robot-rule.dto';
import { CreateSitemapDto } from '../dto/create-sitemap.dto';
import { UpdateSitemapDto } from '../dto/update-sitemap.dto';
import { RobotRuleEntity } from '../entities/robot-rule.entity';
import { SitemapEntity } from '../entities/sitemap.entity';
import { AbilitiesGuard } from 'src/shared/guards/abilities.guard';
import { CheckAbilities } from 'src/shared/decorators/check-abilities.decorator';
import { Resource } from 'src/shared/decorators/resource.decorator';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';

@ApiTags('Robots Management')
@Controller()
export class RobotsController {
  constructor(private readonly logger: LoggerService, private readonly robotsService: RobotsService,) { this.logger.setContext('RobotsController'); }

  @Get('robots.txt')
  @Header('Content-Type', 'text/plain')
  @ApiOperation({ summary: 'Retrieve the dynamically generated robots.txt file' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved robots.txt content.' })
  handleRobotsTxt(@Res() res: Response) {
    this.logger.log('Serving robots.txt request.');
    this.robotsService.generateRobotsTxtContent().then(content => { res.send(content); }).catch(error => {
      this.logger.error('Failed to generate robots.txt content:', error.stack);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Error generating robots.txt');
    });
  }

  // --- Robot Rules Management Endpoints ---
  @Post('robots/rules')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, AbilitiesGuard)
  @CheckAbilities(['manage', 'all']) // Restricted to admin role
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new robots.txt rule (Admin Only)' })
  @ApiBody({ type: CreateRobotRuleDto })
  @ApiResponse({ status: 201, description: 'Robot rule created successfully.', type: RobotRuleEntity })
  @ApiResponse({ status: 400, description: 'Bad Request (validation errors).' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async createRule(@Body() createRobotRuleDto: CreateRobotRuleDto): Promise<RobotRuleEntity> {
    this.logger.log(`Creating robot rule for User-agent: ${createRobotRuleDto.userAgent}`);
    return this.robotsService.createRule(createRobotRuleDto.userAgent, createRobotRuleDto.type, createRobotRuleDto.value, createRobotRuleDto.order);
  }

  @Get('robots/rules')
  @UseGuards(JwtAuthGuard, AbilitiesGuard)
  @CheckAbilities(['read', 'RobotRuleEntity']) // Read access might be broader than admin
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Retrieve all robots.txt rules' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved all robot rules.', type: [RobotRuleEntity] })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async findAllRules(): Promise<RobotRuleEntity[]> {
    this.logger.log('Retrieving all robot rules.');
    return this.robotsService.findAllRules();
  }

  @Get('robots/rules/:id')
  @UseGuards(JwtAuthGuard, AbilitiesGuard)
  @CheckAbilities(['read', 'RobotRuleEntity']) // Read access might be broader than admin
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Retrieve a robots.txt rule by ID' })
  @ApiParam({ name: 'id', description: 'The UUID of the robot rule.' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved the robot rule.', type: RobotRuleEntity })
  @ApiResponse({ status: 404, description: 'Rule not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async findOneRule(@Param('id') id: string): Promise<RobotRuleEntity> {
    this.logger.log(`Retrieving robot rule with ID: ${id}`);
    const rule = await this.robotsService.findRuleById(id);
    if (!rule) { throw new NotFoundException(`Robot rule with ID '${id}' not found.`); }
    return rule;
  }

  @Put('robots/rules/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, AbilitiesGuard)
  @CheckAbilities(['manage', 'all']) // Restricted to admin role
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update an existing robots.txt rule by ID (Admin Only)' })
  @ApiParam({ name: 'id', description: 'The UUID of the robot rule to update.' })
  @ApiBody({ type: UpdateRobotRuleDto })
  @ApiResponse({ status: 200, description: 'Robot rule updated successfully.', type: RobotRuleEntity })
  @ApiResponse({ status: 404, description: 'Rule not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async updateRule(@Param('id') id: string, @Body() updateRobotRuleDto: UpdateRobotRuleDto, @Resource(RobotRuleEntity, 'params.id') robotRule: RobotRuleEntity): Promise<RobotRuleEntity> {
    this.logger.log(`Updating robot rule with ID: ${id}`);
    const updatedRule = await this.robotsService.updateRule(id, updateRobotRuleDto);
    if (!updatedRule) { throw new NotFoundException(`Robot rule with ID '${id}' not found.`); }
    return updatedRule;
  }

  @Delete('robots/rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, AbilitiesGuard)
  @CheckAbilities(['manage', 'all']) // Restricted to admin role
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete a robots.txt rule by ID (Admin Only)' })
  @ApiParam({ name: 'id', description: 'The UUID of the robot rule to delete.' })
  @ApiResponse({ status: 204, description: 'Robot rule deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Rule not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async deleteRule(@Param('id') id: string, @Resource(RobotRuleEntity, 'params.id') robotRule: RobotRuleEntity): Promise<void> {
    this.logger.log(`Deleting robot rule with ID: ${id}`);
    await this.robotsService.deleteRule(id);
  }

  // --- Sitemap Management Endpoints (similar changes) ---
  @Post('robots/sitemaps')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, AbilitiesGuard)
  @CheckAbilities(['manage', 'all']) // Restricted to admin role
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new sitemap entry for robots.txt (Admin Only)' })
  @ApiBody({ type: CreateSitemapDto })
  @ApiResponse({ status: 201, description: 'Sitemap entry created successfully.', type: SitemapEntity })
  @ApiResponse({ status: 400, description: 'Bad Request (validation errors).' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async createSitemap(@Body() createSitemapDto: CreateSitemapDto): Promise<SitemapEntity> {
    this.logger.log(`Creating sitemap entry for URL: ${createSitemapDto.url}`);
    return this.robotsService.createSitemap(createSitemapDto.url, createSitemapDto.isEnabled);
  }

  @Get('robots/sitemaps')
  @UseGuards(JwtAuthGuard, AbilitiesGuard)
  @CheckAbilities(['read', 'SitemapEntity']) // Read access might be broader than admin
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Retrieve all sitemap entries for robots.txt' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved all sitemap entries.', type: [SitemapEntity] })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async findAllSitemaps(): Promise<SitemapEntity[]> {
    this.logger.log('Retrieving all sitemap entries.');
    return this.robotsService.findAllSitemaps();
  }

  @Get('robots/sitemaps/:id')
  @UseGuards(JwtAuthGuard, AbilitiesGuard)
  @CheckAbilities(['read', 'SitemapEntity']) // Read access might be broader than admin
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Retrieve a sitemap entry by ID' })
  @ApiParam({ name: 'id', description: 'The UUID of the sitemap entry.' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved the sitemap entry.', type: SitemapEntity })
  @ApiResponse({ status: 404, description: 'Sitemap not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async findOneSitemap(@Param('id') id: string): Promise<SitemapEntity> {
    this.logger.log(`Retrieving sitemap entry with ID: ${id}`);
    const sitemap = await this.robotsService.findSitemapById(id);
    if (!sitemap) { throw new NotFoundException(`Sitemap with ID '${id}' not found.`); }
    return sitemap;
  }

  @Put('robots/sitemaps/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, AbilitiesGuard)
  @CheckAbilities(['manage', 'all']) // Restricted to admin role
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update an existing sitemap entry by ID (Admin Only)' })
  @ApiParam({ name: 'id', description: 'The UUID of the sitemap entry to update.' })
  @ApiBody({ type: UpdateSitemapDto })
  @ApiResponse({ status: 200, description: 'Sitemap entry updated successfully.', type: SitemapEntity })
  @ApiResponse({ status: 404, description: 'Sitemap not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async updateSitemap(@Param('id') id: string, @Body() updateSitemapDto: UpdateSitemapDto, @Resource(SitemapEntity, 'params.id') sitemap: SitemapEntity): Promise<SitemapEntity> {
    this.logger.log(`Updating sitemap entry with ID: ${id}`);
    const updatedSitemap = await this.robotsService.updateSitemap(id, updateSitemapDto);
    if (!updatedSitemap) { throw new NotFoundException(`Sitemap with ID '${id}' not found.`); }
    return updatedSitemap;
  }

  @Delete('robots/sitemaps/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, AbilitiesGuard)
  @CheckAbilities(['manage', 'all']) // Restricted to admin role
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete a sitemap entry by ID (Admin Only)' })
  @ApiParam({ name: 'id', description: 'The UUID of the sitemap entry to delete.' })
  @ApiResponse({ status: 204, description: 'Sitemap entry deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Sitemap not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async deleteSitemap(@Param('id') id: string, @Resource(SitemapEntity, 'params.id') sitemap: SitemapEntity): Promise<void> {
    this.logger.log(`Deleting sitemap entry with ID: ${id}`);
    await this.robotsService.deleteSitemap(id);
  }
}
