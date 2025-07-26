// src/features/educationpub/controllers/flashcard-model.controller.ts

import { Controller, Post, Get, Param, Body, Put, Delete, HttpCode, HttpStatus, UseGuards, UseInterceptors, ClassSerializerInterceptor } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam } from '@nestjs/swagger';
import { FlashcardModelService } from '../services/flashcard-model.service';

import { FlashcardModelEntity } from '../entities/flashcard-model.entity';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { LoggerService } from 'src/shared/services/logger.service';
import { CreateFlashcardModelDto } from '../dto/create-flashcard-model.dto';
import { UpdateFlashcardModelDto } from '../dto/update-flashcard-model.dto';

@ApiTags('EducationPub - Flashcard Models')
@Controller('edu/flashcard-models')
@ApiBearerAuth('JWT-auth') // Apply JWT authentication to all routes in this controller
@UseGuards(JwtAuthGuard) // Protect all routes in this controller
@UseInterceptors(ClassSerializerInterceptor) // Automatically exclude properties marked with @Exclude()
export class FlashcardModelController {
  constructor(
    private readonly flashcardModelService: FlashcardModelService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('FlashcardModelController');
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new flashcard model' })
  @ApiBody({ type: CreateFlashcardModelDto })
  @ApiResponse({ status: 201, description: 'Flashcard model created successfully.', type: FlashcardModelEntity })
  @ApiResponse({ status: 409, description: 'Conflict, a model with this name already exists.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async create(@Body() createFlashcardModelDto: CreateFlashcardModelDto): Promise<FlashcardModelEntity> {
    this.logger.log(`Received request to create flashcard model: ${createFlashcardModelDto.name}`);
    return this.flashcardModelService.createFlashcardModel(createFlashcardModelDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retrieve all flashcard models' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved all flashcard models.', type: [FlashcardModelEntity] })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async findAll(): Promise<FlashcardModelEntity[]> {
    this.logger.log('Received request to retrieve all flashcard models.');
    return this.flashcardModelService.findAllModels();
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retrieve a flashcard model by ID' })
  @ApiParam({ name: 'id', description: 'The UUID of the flashcard model.' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved the flashcard model.', type: FlashcardModelEntity })
  @ApiResponse({ status: 404, description: 'Flashcard model not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async findOne(@Param('id') id: string): Promise<FlashcardModelEntity> {
    this.logger.log(`Received request to retrieve flashcard model with ID: ${id}`);
    return this.flashcardModelService.findModelById(id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update an existing flashcard model by ID' })
  @ApiParam({ name: 'id', description: 'The UUID of the flashcard model to update.' })
  @ApiBody({ type: UpdateFlashcardModelDto })
  @ApiResponse({ status: 200, description: 'Flashcard model updated successfully.', type: FlashcardModelEntity })
  @ApiResponse({ status: 404, description: 'Flashcard model not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async update(@Param('id') id: string, @Body() updateFlashcardModelDto: UpdateFlashcardModelDto): Promise<FlashcardModelEntity> {
    this.logger.log(`Received request to update flashcard model with ID: ${id}`);
    return this.flashcardModelService.updateFlashcardModel(id, updateFlashcardModelDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT) // 204 No Content for successful deletion
  @ApiOperation({ summary: 'Delete a flashcard model by ID' })
  @ApiParam({ name: 'id', description: 'The UUID of the flashcard model to delete.' })
  @ApiResponse({ status: 204, description: 'Flashcard model deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Flashcard model not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async remove(@Param('id') id: string): Promise<void> {
    this.logger.log(`Received request to delete flashcard model with ID: ${id}`);
    await this.flashcardModelService.deleteFlashcardModel(id);
  }
}
