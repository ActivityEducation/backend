import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FlashcardModelService } from './flashcard-model.service';
import { FlashcardModelEntity } from '../entities/flashcard-model.entity';
import { LoggerService } from 'src/shared/services/logger.service';
import { ConfigService } from '@nestjs/config';
import { ConflictException, ForbiddenException } from '@nestjs/common';

// Mock the repositories and services
const mockFlashcardModelRepository = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  delete: jest.fn(),
};

const mockLoggerService = {
  setContext: jest.fn(),
  log: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('http://localhost:3000'),
};

describe('FlashcardModelService', () => {
  let service: FlashcardModelService;
  let repository: Repository<FlashcardModelEntity>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlashcardModelService,
        {
          provide: getRepositoryToken(FlashcardModelEntity),
          useValue: mockFlashcardModelRepository,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<FlashcardModelService>(FlashcardModelService);
    repository = module.get<Repository<FlashcardModelEntity>>(getRepositoryToken(FlashcardModelEntity));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createFlashcardModel', () => {
    it('should create a new flashcard model', async () => {
      const dto = { name: 'Test Model', fields: [], cardTemplates: [] };
      const actorId = 'test-actor';
      const newModel = { id: '1', ...dto, attributedToActivityPubId: actorId };

      mockFlashcardModelRepository.findOne.mockResolvedValue(null);
      mockFlashcardModelRepository.create.mockReturnValue(newModel);
      mockFlashcardModelRepository.save.mockResolvedValue(newModel);

      const result = await service.createFlashcardModel(dto as any, actorId);

      expect(result).toEqual(newModel);
      expect(mockFlashcardModelRepository.findOne).toHaveBeenCalledWith({ where: { name: dto.name, attributedToActivityPubId: actorId } });
      expect(mockFlashcardModelRepository.create).toHaveBeenCalledWith(expect.objectContaining({ ...dto, attributedToActivityPubId: actorId }));
      expect(mockFlashcardModelRepository.save).toHaveBeenCalledWith(newModel);
    });

    it('should throw a ConflictException if the model already exists for the user', async () => {
      const dto = { name: 'Test Model', fields: [], cardTemplates: [] };
      const actorId = 'test-actor';

      mockFlashcardModelRepository.findOne.mockResolvedValue({ id: '1', ...dto });

      await expect(service.createFlashcardModel(dto as any, actorId)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAllModels', () => {
    it('should return only public models', async () => {
      const publicModel = { id: '1', name: 'Public Model', isPublic: true };
      mockFlashcardModelRepository.find.mockResolvedValue([publicModel]);

      const result = await service.findAllModels();

      expect(result).toEqual([publicModel]);
      expect(mockFlashcardModelRepository.find).toHaveBeenCalledWith({ where: { isPublic: true } });
    });
  });

  describe('findAllModelsForUser', () => {
    it('should return public models and models created by the user', async () => {
      const publicModel = { id: '1', name: 'Public Model', isPublic: true };
      const userModel = { id: '2', name: 'User Model', isPublic: false, attributedToActivityPubId: 'test-actor' };
      mockFlashcardModelRepository.find.mockResolvedValue([publicModel, userModel]);

      const result = await service.findAllModelsForUser('test-actor');

      expect(result).toEqual([publicModel, userModel]);
      expect(mockFlashcardModelRepository.find).toHaveBeenCalledWith({ where: [{ isPublic: true }, { attributedToActivityPubId: 'test-actor' }] });
    });
  });

  describe('findModelById', () => {
    it('should return a public model', async () => {
      const publicModel = { id: '1', name: 'Public Model', isPublic: true };
      mockFlashcardModelRepository.findOne.mockResolvedValue(publicModel);

      const result = await service.findModelById('1');

      expect(result).toEqual(publicModel);
      expect(mockFlashcardModelRepository.findOne).toHaveBeenCalledWith({ where: { id: '1' } });
    });

    it('should return a private model if the user is the creator', async () => {
      const privateModel = { id: '1', name: 'Private Model', isPublic: false, attributedToActivityPubId: 'test-actor' };
      mockFlashcardModelRepository.findOne.mockResolvedValue(privateModel);

      const result = await service.findModelById('1', 'test-actor');

      expect(result).toEqual(privateModel);
    });

    it('should throw a ForbiddenException if the user tries to access a private model they do not own', async () => {
      const privateModel = { id: '1', name: 'Private Model', isPublic: false, attributedToActivityPubId: 'other-actor' };
      mockFlashcardModelRepository.findOne.mockResolvedValue(privateModel);

      await expect(service.findModelById('1', 'test-actor')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateFlashcardModel', () => {
    it('should update a model if the user is the creator', async () => {
      const model = { id: '1', name: 'Test Model', attributedToActivityPubId: 'test-actor' };
      const dto = { name: 'Updated Model' };

      mockFlashcardModelRepository.findOne.mockResolvedValue(model);
      mockFlashcardModelRepository.save.mockResolvedValue({ ...model, ...dto });

      const result = await service.updateFlashcardModel('1', dto as any, 'test-actor');

      expect(result.name).toEqual('Updated Model');
    });

    it('should throw a ForbiddenException if the user is not the creator', async () => {
      const model = { id: '1', name: 'Test Model', attributedToActivityPubId: 'other-actor' };
      const dto = { name: 'Updated Model' };

      mockFlashcardModelRepository.findOne.mockResolvedValue(model);

      await expect(service.updateFlashcardModel('1', dto as any, 'test-actor')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteFlashcardModel', () => {
    it('should delete a model if the user is the creator', async () => {
      const model = { id: '1', name: 'Test Model', attributedToActivityPubId: 'test-actor' };

      mockFlashcardModelRepository.findOne.mockResolvedValue(model);
      mockFlashcardModelRepository.delete.mockResolvedValue({ affected: 1 });

      await service.deleteFlashcardModel('1', 'test-actor');

      expect(mockFlashcardModelRepository.delete).toHaveBeenCalledWith('1');
    });

    it('should throw a ForbiddenException if the user is not the creator', async () => {
      const model = { id: '1', name: 'Test Model', attributedToActivityPubId: 'other-actor' };

      mockFlashcardModelRepository.findOne.mockResolvedValue(model);

      await expect(service.deleteFlashcardModel('1', 'test-actor')).rejects.toThrow(ForbiddenException);
    });
  });
});
