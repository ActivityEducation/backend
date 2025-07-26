// src/features/educationpub/controllers/flashcard.controller.ts
// Updated to use FlashcardEntity and FlashcardService, and new endpoints

import {
  Controller,
  Post,
  Get,
  Param,
  NotFoundException,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  ClassSerializerInterceptor,
  Body,
  UseGuards,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  Put,
  Delete,
  ConflictException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { ActorEntity } from 'src/features/activitypub/entities/actor.entity';
import { LoggerService } from 'src/shared/services/logger.service';
import { CreateFlashcardPayload } from '../dto/create-fashcard.dto';
import { FlashcardEntity } from '../entities/flashcard.entity';
import { FlashcardService } from '../services/flashcard.service';
import { User } from 'src/shared/decorators/user.decorator';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { UpdateFlashcardDto } from '../dto/update-flashcard.dto';
import { Flashcard as FlashcardView } from '../views/flashcard.view'; // Renamed import to avoid conflict
import { Repository } from 'typeorm'; // Import Repository
import { InjectRepository } from '@nestjs/typeorm'; // Import InjectRepository

@ApiTags('EducationPub - Flashcards')
@Controller('edu/flashcards')
@ApiBearerAuth('JWT-auth') // Apply JWT authentication to all routes in this controller that require it
@UseInterceptors(ClassSerializerInterceptor) // Apply serializer globally to this controller
export class EducationPubController {
  constructor(
    private readonly flashcardService: FlashcardService, // Inject FlashcardService
    private readonly logger: LoggerService, // Inject LoggerService
    @InjectRepository(ActorEntity) // Still need ActorEntity directly for username validation
    private readonly actorRepository: Repository<ActorEntity>,
  ) {
    this.logger.setContext('EducationPubController');
  }

  @Get()
  @UseGuards(JwtAuthGuard) // Protect this route if it should only show user's flashcards
  @ApiOperation({ summary: 'Retrieve all flashcards (paginated)' })
  @ApiOkResponse({ type: [FlashcardView], description: 'Successfully retrieved a paginated list of flashcards.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getFlashcards(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<{ data: FlashcardEntity[]; total: number; page: number; limit: number }> {
    this.logger.log(`Fetching all flashcards, page: ${page}, limit: ${limit}`);
    const [flashcards, total] = await this.flashcardService.findAllFlashcardsPaginated(page, limit);

    return {
      data: flashcards,
      total,
      page,
      limit,
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Retrieve a flashcard by ID' })
  @ApiParam({ name: 'id', description: 'The UUID of the flashcard.' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved the flashcard.', type: FlashcardView })
  @ApiResponse({ status: 404, description: 'Flashcard not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getFlashcardById(@Param('id') id: string): Promise<FlashcardEntity> {
    this.logger.log(`Fetching flashcard with ID: ${id}`);
    return this.flashcardService.findFlashcardById(id);
  }

  /**
   * Creates a new EducationPub Flashcard for a specified user.
   * Saves the flashcard to the database and sends a 'Create' activity to the Fediverse.
   *
   * @param username The preferred username of the actor creating the flashcard. Must match authenticated user.
   * @param localActorId The internal DB ID of the authenticated actor.
   * @param createFlashcardPayload The incoming flashcard data.
   * @param isPublicQuery Optional query param to force public status (primarily for testing/dev ease).
   * @returns The created flashcard object.
   */
  @Post(':username')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard) // Require JWT authentication
  @ApiOperation({ summary: 'Create a new EducationPub Flashcard for a user' })
  @ApiParam({
    name: 'username',
    description: 'The preferred username of the actor creating the flashcard. Must match authenticated user.',
  })
  @ApiBody({
    type: CreateFlashcardPayload,
    description: 'The payload for the new flashcard.',
  })
  @ApiResponse({
    status: 201,
    description: 'Flashcard created and enqueued for Fediverse delivery if public.',
    type: FlashcardView,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request (e.g., invalid payload, missing model).',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden (username mismatch).' })
  @ApiResponse({ status: 404, description: 'Actor or Flashcard Model not found.' })
  @ApiResponse({ status: 500, description: 'Internal server error.' })
  async createFlashcard(
    @Param('username') username: string,
    @User('actor.activityPubId') localActorId: string, // Get authenticated user's internal ID
    @Body() createFlashcardPayload: CreateFlashcardPayload,
    @Query('isPublic', new DefaultValuePipe(false)) isPublicQuery: boolean, // Allow overriding for testing
  ): Promise<FlashcardEntity> {
    this.logger.log(`Received request to create flashcard for user: ${username}, authenticated as actor ID: ${localActorId}`);

    const actor = await this.actorRepository.findOne({ where: { id: localActorId } });
    if (!actor || actor.preferredUsername !== username) {
      throw new NotFoundException(`Actor '${username}' not found or you are not authorized to create content for this user.`);
    }

    // Delegate to FlashcardService
    return this.flashcardService.createFlashcard(localActorId, createFlashcardPayload, isPublicQuery);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update an existing flashcard by ID' })
  @ApiParam({ name: 'id', description: 'The UUID of the flashcard to update.' })
  @ApiBody({ type: UpdateFlashcardDto })
  @ApiResponse({ status: 200, description: 'Flashcard updated successfully.', type: FlashcardView })
  @ApiResponse({ status: 404, description: 'Flashcard not found or unauthorized.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async updateFlashcard(
    @Param('id') id: string,
    @User('actor.activityPubId') localActorId: string,
    @Body() updateFlashcardDto: UpdateFlashcardDto,
  ): Promise<FlashcardEntity> {
    this.logger.log(`Received request to update flashcard ID: ${id} by actor ID: ${localActorId}`);
    return this.flashcardService.updateFlashcard(id, localActorId, updateFlashcardDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a flashcard by ID' })
  @ApiParam({ name: 'id', description: 'The UUID of the flashcard to delete.' })
  @ApiResponse({ status: 204, description: 'Flashcard deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Flashcard not found or unauthorized.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async deleteFlashcard(
    @Param('id') id: string,
    @User('actor.activityPubId') localActorId: string,
  ): Promise<void> {
    this.logger.log(`Received request to delete flashcard ID: ${id} by actor ID: ${localActorId}`);
    await this.flashcardService.deleteFlashcard(id, localActorId);
  }

  @Post(':id/like')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Like a flashcard and enqueue Like activity' })
  @ApiParam({ name: 'id', description: 'The ID of the flashcard to like.' })
  @ApiResponse({ status: 202, description: 'Like activity enqueued for dispatch.' })
  @ApiResponse({ status: 404, description: 'Flashcard or Actor not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 409, description: 'Conflict (already liked).' })
  async likeFlashcard(
    @Param('id') id: string,
    @User('actor.activityPubId') localActorId: string,
  ): Promise<{ message: string; liked: boolean }> {
    this.logger.log(`Actor ID '${localActorId}' attempting to like flashcard ID: ${id}`);
    return this.flashcardService.handleFlashcardLike(id, localActorId);
  }

  @Post(':id/boost')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Boost (Announce) a flashcard and enqueue Announce activity' })
  @ApiParam({ name: 'id', description: 'The ID of the flashcard to boost.' })
  @ApiResponse({ status: 202, description: 'Announce activity enqueued for dispatch.' })
  @ApiResponse({ status: 404, description: 'Flashcard or Actor not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 409, description: 'Conflict (already boosted).' })
  async boostFlashcard(
    @Param('id') id: string,
    @User('actor.activityPubId') localActorId: string,
  ): Promise<{ message: string; boosted: boolean }> {
    this.logger.log(`Actor ID '${localActorId}' attempting to boost flashcard ID: ${id}`);
    return this.flashcardService.handleFlashcardBoost(id, localActorId);
  }
}
