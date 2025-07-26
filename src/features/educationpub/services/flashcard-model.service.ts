// src/features/educationpub/services/flashcard-model.service.ts

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FlashcardModelEntity } from '../entities/flashcard-model.entity';
import { LoggerService } from 'src/shared/services/logger.service';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { CreateFlashcardModelDto } from '../dto/create-flashcard-model.dto';
import { UpdateFlashcardModelDto } from '../dto/update-flashcard-model.dto';

@Injectable()
export class FlashcardModelService {
  private readonly instanceBaseUrl: string;

  constructor(
    @InjectRepository(FlashcardModelEntity)
    private readonly flashcardModelRepository: Repository<FlashcardModelEntity>,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    this.logger.setContext('FlashcardModelService');
    const baseUrl = this.configService.get<string>('INSTANCE_BASE_URL');
    if (!baseUrl) {
      this.logger.error('INSTANCE_BASE_URL is not defined in environment variables.');
      throw new Error('INSTANCE_BASE_URL is not defined.');
    }
    this.instanceBaseUrl = baseUrl;
  }

  async createFlashcardModel(dto: CreateFlashcardModelDto): Promise<FlashcardModelEntity> {
    this.logger.log(`Attempting to create flashcard model: ${dto.name}`);
    const existingModel = await this.flashcardModelRepository.findOne({ where: { name: dto.name } });
    if (existingModel) {
      throw new ConflictException(`Flashcard model with name '${dto.name}' already exists.`);
    }

    const activityPubId = `${this.instanceBaseUrl}/flashcard-models/${randomUUID()}`;

    const newModel = this.flashcardModelRepository.create({
      ...dto,
      activityPubId: activityPubId,
    });
    const savedModel = await this.flashcardModelRepository.save(newModel);
    this.logger.log(`Flashcard model created: ${savedModel.name} (${savedModel.id})`);
    return savedModel;
  }

  async findAllModels(): Promise<FlashcardModelEntity[]> {
    this.logger.debug('Fetching all flashcard models.');
    return this.flashcardModelRepository.find();
  }

  async findModelById(id: string): Promise<FlashcardModelEntity> {
    this.logger.debug(`Fetching flashcard model by ID: ${id}`);
    const model = await this.flashcardModelRepository.findOne({ where: { id } });
    if (!model) {
      throw new NotFoundException(`Flashcard model with ID '${id}' not found.`);
    }
    return model;
  }

  async findModelByActivityPubId(activityPubId: string): Promise<FlashcardModelEntity> {
    this.logger.debug(`Fetching flashcard model by ActivityPub ID: ${activityPubId}`);
    const model = await this.flashcardModelRepository.findOne({ where: { activityPubId } });
    if (!model) {
      throw new NotFoundException(`Flashcard model with ActivityPub ID '${activityPubId}' not found.`);
    }
    return model;
  }

  async updateFlashcardModel(id: string, dto: UpdateFlashcardModelDto): Promise<FlashcardModelEntity> {
    this.logger.log(`Attempting to update flashcard model with ID: ${id}`);
    const model = await this.findModelById(id); // Reuses findModelById for existence check
    Object.assign(model, dto);
    const updatedModel = await this.flashcardModelRepository.save(model);
    this.logger.log(`Flashcard model updated: ${updatedModel.name} (${updatedModel.id})`);
    return updatedModel;
  }

  async deleteFlashcardModel(id: string): Promise<void> {
    this.logger.log(`Attempting to delete flashcard model with ID: ${id}`);
    const result = await this.flashcardModelRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Flashcard model with ID '${id}' not found.`);
    }
    this.logger.log(`Flashcard model deleted: ID ${id}`);
  }
}
