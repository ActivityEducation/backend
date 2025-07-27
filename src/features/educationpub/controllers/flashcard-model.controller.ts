// src/features/educationpub/controllers/flashcard-model.controller.ts
import { Controller, Post, Get, Param, Body, Put, Delete, HttpCode, HttpStatus, UseGuards, UseInterceptors, ClassSerializerInterceptor, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam } from '@nestjs/swagger';
import { FlashcardModelService } from '../services/flashcard-model.service';
import { FlashcardModelEntity } from '../entities/flashcard-model.entity';
import { LoggerService } from 'src/shared/services/logger.service';
import { CreateFlashcardModelDto } from '../dto/create-flashcard-model.dto';
import { UpdateFlashcardModelDto } from '../dto/update-flashcard-model.dto';
import { AbilitiesGuard } from 'src/shared/guards/abilities.guard';
import { CheckAbilities } from 'src/shared/decorators/check-abilities.decorator';
import { Resource } from 'src/shared/decorators/resource.decorator';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';

@ApiTags('EducationPub - Flashcard Models')
@Controller('edu/flashcard-models')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, AbilitiesGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class FlashcardModelController {
  constructor(private readonly flashcardModelService: FlashcardModelService, private readonly logger: LoggerService,) { this.logger.setContext('FlashcardModelController'); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckAbilities(['create', FlashcardModelEntity.name])
  @ApiOperation({ summary: 'Create a new flashcard model' })
  @ApiBody({ type: CreateFlashcardModelDto })
  @ApiResponse({ status: 201, description: 'Flashcard model created successfully.', type: FlashcardModelEntity })
  @ApiResponse({ status: 409, description: 'Conflict, a model with this name already exists.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async create(@Body() createFlashcardModelDto: CreateFlashcardModelDto): Promise<FlashcardModelEntity> {
    this.logger.log(`Received request to create flashcard model: ${createFlashcardModelDto.name}`);
    return this.flashcardModelService.createFlashcardModel(createFlashcardModelDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @CheckAbilities(['read', FlashcardModelEntity.name])
  @ApiOperation({ summary: 'Retrieve all flashcard models' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved all flashcard models.', type: [FlashcardModelEntity] })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async findAll(): Promise<FlashcardModelEntity[]> {
    this.logger.log('Received request to retrieve all flashcard models.');
    return this.flashcardModelService.findAllModels();
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @CheckAbilities(['read', FlashcardModelEntity.name])
  @ApiOperation({ summary: 'Retrieve a flashcard model by ID' })
  @ApiParam({ name: 'id', description: 'The UUID of the flashcard model.' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved the flashcard model.', type: FlashcardModelEntity })
  @ApiResponse({ status: 404, description: 'Flashcard model not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async findOne(@Param('id') id: string): Promise<FlashcardModelEntity> {
    this.logger.log(`Received request to retrieve flashcard model with ID: ${id}`);
    return this.flashcardModelService.findModelById(id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @CheckAbilities(['update', FlashcardModelEntity.name, { creator: { id: '{{user.id}}' } }])
  @ApiOperation({ summary: 'Update an existing flashcard model by ID' })
  @ApiParam({ name: 'id', description: 'The UUID of the flashcard model to update.' })
  @ApiBody({ type: UpdateFlashcardModelDto })
  @ApiResponse({ status: 200, description: 'Flashcard model updated successfully.', type: FlashcardModelEntity })
  @ApiResponse({ status: 404, description: 'Flashcard model not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async update(@Param('id') id: string, @Resource(FlashcardModelEntity, 'params.id') flashcardModel: FlashcardModelEntity, @Body() updateFlashcardModelDto: UpdateFlashcardModelDto): Promise<FlashcardModelEntity> {
    this.logger.log(`Received request to update flashcard model with ID: ${id}`);
    return this.flashcardModelService.updateFlashcardModel(flashcardModel.id, updateFlashcardModelDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckAbilities(['delete', FlashcardModelEntity.name, { creator: { id: '{{user.id}}' } }])
  @ApiOperation({ summary: 'Delete a flashcard model by ID' })
  @ApiParam({ name: 'id', description: 'The UUID of the flashcard model to delete.' })
  @ApiResponse({ status: 204, description: 'Flashcard model deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Flashcard model not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async remove(@Param('id') id: string, @Resource(FlashcardModelEntity, 'params.id') flashcardModel: FlashcardModelEntity): Promise<void> {
    this.logger.log(`Received request to delete flashcard model with ID: ${id}`);
    await this.flashcardModelService.deleteFlashcardModel(flashcardModel.id);
  }
}
