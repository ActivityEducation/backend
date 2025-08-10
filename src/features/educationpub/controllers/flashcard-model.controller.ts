// src/features/educationpub/controllers/flashcard-model.controller.ts
import { Controller, Post, Get, Param, Body, Put, Delete, HttpCode, HttpStatus, UseGuards, UseInterceptors, ClassSerializerInterceptor } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam } from '@nestjs/swagger';
import { FlashcardModelService } from '../services/flashcard-model.service';
import { FlashcardModelEntity } from '../entities/flashcard-model.entity';
import { LoggerService } from 'src/shared/services/logger.service';
import { CreateFlashcardModelDto } from '../dto/create-flashcard-model.dto';
import { UpdateFlashcardModelDto } from '../dto/update-flashcard-model.dto';
import { AbilitiesGuard } from 'src/shared/guards/abilities.guard';
import { CheckAbilities } from 'src/shared/decorators/check-abilities.decorator';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { User } from 'src/shared/decorators/user.decorator';
import { UserEntity } from '../../auth/entities/user.entity';

@ApiTags('EducationPub - Flashcard Models')
@Controller('edu/flashcard-models')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, AbilitiesGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class FlashcardModelController {
  constructor(private readonly flashcardModelService: FlashcardModelService, private readonly logger: LoggerService,) { this.logger.setContext('FlashcardModelController'); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckAbilities(['create', 'FlashcardModelEntity'])
  @ApiOperation({ summary: 'Create a new flashcard model' })
  @ApiBody({ type: CreateFlashcardModelDto })
  @ApiResponse({ status: 201, description: 'Flashcard model created successfully.', type: FlashcardModelEntity })
  @ApiResponse({ status: 409, description: 'Conflict, a model with this name already exists.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async create(@Body() createFlashcardModelDto: CreateFlashcardModelDto, @User() user: UserEntity): Promise<FlashcardModelEntity> {
    this.logger.log(`Received request to create flashcard model: ${createFlashcardModelDto.name}`);
    return this.flashcardModelService.createFlashcardModel(createFlashcardModelDto, user.actor.activityPubId);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @CheckAbilities(['read', 'FlashcardModelEntity'])
  @ApiOperation({ summary: 'Retrieve all flashcard models for the current user' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved all flashcard models.', type: [FlashcardModelEntity] })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async findAll(@User() user: UserEntity): Promise<FlashcardModelEntity[]> {
    this.logger.log('Received request to retrieve all flashcard models.');
    return this.flashcardModelService.findAllModelsForUser(user.actor.activityPubId);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @CheckAbilities(['read', 'FlashcardModelEntity'])
  @ApiOperation({ summary: 'Retrieve a flashcard model by ID' })
  @ApiParam({ name: 'id', description: 'The UUID of the flashcard model.' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved the flashcard model.', type: FlashcardModelEntity })
  @ApiResponse({ status: 404, description: 'Flashcard model not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async findOne(@Param('id') id: string, @User() user: UserEntity): Promise<FlashcardModelEntity> {
    this.logger.log(`Received request to retrieve flashcard model with ID: ${id}`);
    return this.flashcardModelService.findModelById(id, user.actor.activityPubId);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @CheckAbilities(['update', 'FlashcardModelEntity'])
  @ApiOperation({ summary: 'Update an existing flashcard model by ID' })
  @ApiParam({ name: 'id', description: 'The UUID of the flashcard model to update.' })
  @ApiBody({ type: UpdateFlashcardModelDto })
  @ApiResponse({ status: 200, description: 'Flashcard model updated successfully.', type: FlashcardModelEntity })
  @ApiResponse({ status: 404, description: 'Flashcard model not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async update(@Param('id') id: string, @Body() updateFlashcardModelDto: UpdateFlashcardModelDto, @User() user: UserEntity): Promise<FlashcardModelEntity> {
    this.logger.log(`Received request to update flashcard model with ID: ${id}`);
    return this.flashcardModelService.updateFlashcardModel(id, updateFlashcardModelDto, user.actor.activityPubId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckAbilities(['delete', 'FlashcardModelEntity'])
  @ApiOperation({ summary: 'Delete a flashcard model by ID' })
  @ApiParam({ name: 'id', description: 'The UUID of the flashcard model to delete.' })
  @ApiResponse({ status: 204, description: 'Flashcard model deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Flashcard model not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async remove(@Param('id') id: string, @User() user: UserEntity): Promise<void> {
    this.logger.log(`Received request to delete flashcard model with ID: ${id}`);
    await this.flashcardModelService.deleteFlashcardModel(id, user.actor.activityPubId);
  }
}
