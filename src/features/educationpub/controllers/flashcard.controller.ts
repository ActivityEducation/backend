// src/features/educationpub/controllers/flashcard.controller.ts
import { Controller, Post, Get, Param, Body, Put, Delete, HttpCode, HttpStatus, UseGuards, UseInterceptors, ClassSerializerInterceptor, Query, DefaultValuePipe, ParseIntPipe, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiBearerAuth, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { ActorEntity } from 'src/features/activitypub/entities/actor.entity';
import { LoggerService } from 'src/shared/services/logger.service';
import { CreateFlashcardPayload } from '../dto/create-fashcard.dto';
import { FlashcardEntity } from '../entities/flashcard.entity';
import { FlashcardService } from '../services/flashcard.service';
import { User } from 'src/shared/decorators/user.decorator';
import { UpdateFlashcardDto } from '../dto/update-flashcard.dto';
import { Flashcard as FlashcardView } from '../views/flashcard.view';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { AbilitiesGuard } from 'src/shared/guards/abilities.guard';
import { CheckAbilities } from 'src/shared/decorators/check-abilities.decorator';
import { Resource } from 'src/shared/decorators/resource.decorator';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';

@ApiTags('EducationPub - Flashcards')
@Controller('edu/flashcards')
@ApiBearerAuth('JWT-auth')
@UseInterceptors(ClassSerializerInterceptor)
export class EducationPubController {
  constructor(
    private readonly flashcardService: FlashcardService, private readonly logger: LoggerService,
    @InjectRepository(ActorEntity) private readonly actorRepository: Repository<ActorEntity>,
  ) { this.logger.setContext('EducationPubController'); }

  @Get('related')
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ name: 'id', required: true, description: 'The ID of the flashcard', })
  async relatedFlashcards(@Query('id') id: string) {
    return this.flashcardService.getRelatedFlashcards(id, 6);
  }

  @Post('flush-knowledge-graph')
  flushKnowledgeGraph() {
    return this.flashcardService.recategorizeAllFlashcards();
  }

  @Get('find')
  public findNodeByFlashcardId(
    @Query('id') id: string,
  ) {
    return this.flashcardService.findNodeIdForFlashcard(id)
  }

  @Get()
  @UseGuards(JwtAuthGuard, AbilitiesGuard)
  @CheckAbilities(['read', 'FlashcardEntity'])
  @ApiOperation({ summary: 'Retrieve all flashcards (paginated)' })
  @ApiOkResponse({ type: [FlashcardView], description: 'Successfully retrieved a paginated list of flashcards.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getFlashcards(@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number, @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number): Promise<{ data: FlashcardEntity[]; total: number; page: number; limit: number }> {
    this.logger.log(`Fetching all flashcards, page: ${page}, limit: ${limit}`);
    const [flashcards, total] = await this.flashcardService.findAllFlashcardsPaginated(page, limit);
    return { data: flashcards, total, page, limit, };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, AbilitiesGuard)
  @CheckAbilities(['read', 'FlashcardEntity'])
  @ApiOperation({ summary: 'Retrieve a flashcard by ID' })
  @ApiParam({ name: 'id', description: 'The UUID of the flashcard.' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved the flashcard.', type: FlashcardView })
  @ApiResponse({ status: 404, description: 'Flashcard not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getFlashcardById(@Param('id') id: string): Promise<FlashcardEntity> {
    this.logger.log(`Fetching flashcard with ID: ${id}`);
    return this.flashcardService.findFlashcardById(id);
  }

  @Post(':username')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, AbilitiesGuard)
  @CheckAbilities(['create', 'FlashcardEntity'])
  @ApiOperation({ summary: 'Create a new EducationPub Flashcard for a user' })
  @ApiParam({ name: 'username', description: 'The preferred username of the actor creating the flashcard. Must match authenticated user.', })
  @ApiBody({ type: CreateFlashcardPayload, description: 'The payload for the new flashcard.', })
  @ApiResponse({ status: 201, description: 'Flashcard created and enqueued for Fediverse delivery if public.', type: FlashcardView, })
  @ApiResponse({ status: 400, description: 'Bad Request (validation errors).' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden (username mismatch).' })
  @ApiResponse({ status: 404, description: 'Actor or Flashcard Model not found.' })
  @ApiResponse({ status: 500, description: 'Internal server error.' })
  async createFlashcard(@Param('username') username: string, @User('actor.id') localActorInternalId: string, @Body() createFlashcardPayload: CreateFlashcardPayload, @Query('isPublic', new DefaultValuePipe(false)) isPublicQuery: boolean,): Promise<FlashcardEntity> {
    this.logger.log(`Received request to create flashcard for user: ${username}, authenticated as actor internal ID: ${localActorInternalId}`);
    const actor = await this.actorRepository.findOne({ where: { id: localActorInternalId } });
    if (!actor || actor.preferredUsername !== username) { throw new NotFoundException(`Actor '${username}' not found or you are not authorized to create content for this user.`); }
    return this.flashcardService.createFlashcard(localActorInternalId, createFlashcardPayload, isPublicQuery);
  }

  @Post(':username/mass-import')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, AbilitiesGuard)
  @CheckAbilities(['create', 'FlashcardEntity'])
  @ApiOperation({ summary: 'Create a new EducationPub Flashcard for a user' })
  @ApiParam({ name: 'username', description: 'The preferred username of the actor creating the flashcard. Must match authenticated user.', })
  @ApiBody({ type: CreateFlashcardPayload, description: 'The payload for the new flashcard.', })
  @ApiResponse({ status: 201, description: 'Flashcard created and enqueued for Fediverse delivery if public.', type: FlashcardView, })
  @ApiResponse({ status: 400, description: 'Bad Request (validation errors).' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden (username mismatch).' })
  @ApiResponse({ status: 404, description: 'Actor or Flashcard Model not found.' })
  @ApiResponse({ status: 500, description: 'Internal server error.' })
  async createFlashcards(@Param('username') username: string, @User('actor.id') localActorInternalId: string, @Body() createFlashcardPayload: CreateFlashcardPayload[], @Query('isPublic', new DefaultValuePipe(false)) isPublicQuery: boolean,): Promise<FlashcardEntity[]> {
    this.logger.log(`Received request to create flashcard for user: ${username}, authenticated as actor internal ID: ${localActorInternalId}`);
    const actor = await this.actorRepository.findOne({ where: { id: localActorInternalId } });
    if (!actor || actor.preferredUsername !== username) { throw new NotFoundException(`Actor '${username}' not found or you are not authorized to create content for this user.`); }
    return Promise.all(createFlashcardPayload.map(async (payload) => {
      return await this.flashcardService.createFlashcard(localActorInternalId, payload, isPublicQuery);
    }));
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, AbilitiesGuard)
  @CheckAbilities(['update', 'FlashcardEntity', { creator: { id: '{{user.id}}' } }])
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update an existing flashcard by ID' })
  @ApiParam({ name: 'id', description: 'The UUID of the flashcard to update.' })
  @ApiBody({ type: UpdateFlashcardDto })
  @ApiResponse({ status: 200, description: 'Flashcard updated successfully.', type: FlashcardView })
  @ApiResponse({ status: 404, description: 'Flashcard not found or unauthorized.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async updateFlashcard(@Param('id') id: string, @User('id') userId: string, @Resource(FlashcardEntity, 'params.id') flashcard: FlashcardEntity, @Body() updateFlashcardDto: UpdateFlashcardDto,): Promise<FlashcardEntity> {
    this.logger.log(`Received request to update flashcard ID: ${id} by user ID: ${userId}`);
    return this.flashcardService.updateFlashcard(flashcard.id, userId, updateFlashcardDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, AbilitiesGuard)
  @CheckAbilities(['delete', 'FlashcardEntity', { creator: { id: '{{user.id}}' } }])
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete a flashcard by ID' })
  @ApiParam({ name: 'id', description: 'The UUID of the flashcard to delete.' })
  @ApiResponse({ status: 204, description: 'Flashcard deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Flashcard not found or unauthorized.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async deleteFlashcard(@Param('id') id: string, @User('id') userId: string, @Resource(FlashcardEntity, 'params.id') flashcard: FlashcardEntity,): Promise<void> {
    this.logger.log(`Received request to delete flashcard ID: ${id} by user ID: ${userId}`);
    await this.flashcardService.deleteFlashcard(flashcard.id, userId);
  }

  @Post(':id/like')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard, AbilitiesGuard)
  @CheckAbilities(['like', 'FlashcardEntity'])
  @ApiOperation({ summary: 'Like a flashcard and enqueue Like activity' })
  @ApiParam({ name: 'id', description: 'The ID of the flashcard to like.' })
  @ApiResponse({ status: 202, description: 'Like activity enqueued for dispatch.' })
  @ApiResponse({ status: 404, description: 'Flashcard or Actor not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 409, description: 'Conflict (already liked).' })
  async likeFlashcard(@Param('id') id: string, @User('actor.activityPubId') localActorId: string,): Promise<{ message: string; liked: boolean }> {
    this.logger.log(`Actor ID '${localActorId}' attempting to like flashcard ID: ${id}`);
    return this.flashcardService.handleFlashcardLike(id, localActorId);
  }

  @Post(':id/boost')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard, AbilitiesGuard)
  @CheckAbilities(['boost', 'FlashcardEntity'])
  @ApiOperation({ summary: 'Boost (Announce) a flashcard and enqueue Announce activity' })
  @ApiParam({ name: 'id', description: 'The ID of the flashcard to boost.' })
  @ApiResponse({ status: 202, description: 'Announce activity enqueued for dispatch.' })
  @ApiResponse({ status: 404, description: 'Flashcard or Actor not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 409, description: 'Conflict (already boosted).' })
  async boostFlashcard(@Param('id') id: string, @User('actor.activityPubId') localActorId: string,): Promise<{ message: string; boosted: boolean }> {
    this.logger.log(`Actor ID '${localActorId}' attempting to boost flashcard ID: ${id}`);
    return this.flashcardService.handleFlashcardBoost(id, localActorId);
  }
}
