import { Test, TestingModule } from '@nestjs/testing';
import { FlashcardModelController } from './flashcard-model.controller';
import { FlashcardModelService } from '../services/flashcard-model.service';
import { LoggerService } from 'src/shared/services/logger.service';
import { UserEntity } from '../../auth/entities/user.entity';
import { ActorEntity } from '../../activitypub/entities/actor.entity';
import { AbilityFactory } from 'src/shared/authorization/ability.factory';
import { PermissionConfigService } from 'src/shared/config/permission-config.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AbilitiesGuard } from 'src/shared/guards/abilities.guard';
import { Reflector } from '@nestjs/core';

const mockFlashcardModelService = {
  createFlashcardModel: jest.fn(),
  findAllModelsForUser: jest.fn(),
  findModelById: jest.fn(),
  updateFlashcardModel: jest.fn(),
  deleteFlashcardModel: jest.fn(),
};

const mockLoggerService = {
  setContext: jest.fn(),
  log: jest.fn(),
};

const mockUser: UserEntity = {
  id: '1',
  username: 'test-user',
  actor: { activityPubId: 'test-actor' } as ActorEntity,
} as UserEntity;

const mockPermissionConfigService = {
  getPermissionsForRole: jest.fn().mockReturnValue([]),
};

describe('FlashcardModelController', () => {
  let controller: FlashcardModelController;
  let service: FlashcardModelService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      controllers: [FlashcardModelController],
      providers: [
        {
          provide: FlashcardModelService,
          useValue: mockFlashcardModelService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        AbilityFactory,
        {
          provide: PermissionConfigService,
          useValue: mockPermissionConfigService,
        },
        {
          provide: 'REDIS_CLIENT',
          useValue: { get: jest.fn(), set: jest.fn() },
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: { findOne: jest.fn() },
        },
        AbilitiesGuard,
        Reflector,
      ],
    }).compile();

    controller = module.get<FlashcardModelController>(FlashcardModelController);
    service = module.get<FlashcardModelService>(FlashcardModelService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call the service with the correct parameters', async () => {
      const dto = { name: 'Test Model' } as any;
      // Mock the ability check
      const ability = { can: jest.fn().mockReturnValue(true) };
      jest.spyOn(module.get(AbilityFactory), 'createForUser').mockResolvedValue(ability as any);

      await controller.create(dto, mockUser);
      expect(service.createFlashcardModel).toHaveBeenCalledWith(dto, mockUser.actor.activityPubId);
    });
  });

  describe('findAll', () => {
    it('should call the service with the correct parameters', async () => {
      const ability = { can: jest.fn().mockReturnValue(true) };
      jest.spyOn(module.get(AbilityFactory), 'createForUser').mockResolvedValue(ability as any);

      await controller.findAll(mockUser);
      expect(service.findAllModelsForUser).toHaveBeenCalledWith(mockUser.actor.activityPubId);
    });
  });

  describe('findOne', () => {
    it('should call the service with the correct parameters', async () => {
      const id = '1';
      const ability = { can: jest.fn().mockReturnValue(true) };
      jest.spyOn(module.get(AbilityFactory), 'createForUser').mockResolvedValue(ability as any);

      await controller.findOne(id, mockUser);
      expect(service.findModelById).toHaveBeenCalledWith(id, mockUser.actor.activityPubId);
    });
  });

  describe('update', () => {
    it('should call the service with the correct parameters', async () => {
      const id = '1';
      const dto = { name: 'Updated Model' } as any;
      const ability = { can: jest.fn().mockReturnValue(true) };
      jest.spyOn(module.get(AbilityFactory), 'createForUser').mockResolvedValue(ability as any);

      await controller.update(id, dto, mockUser);
      expect(service.updateFlashcardModel).toHaveBeenCalledWith(id, dto, mockUser.actor.activityPubId);
    });
  });

  describe('remove', () => {
    it('should call the service with the correct parameters', async () => {
      const id = '1';
      const ability = { can: jest.fn().mockReturnValue(true) };
      jest.spyOn(module.get(AbilityFactory), 'createForUser').mockResolvedValue(ability as any);

      await controller.remove(id, mockUser);
      expect(service.deleteFlashcardModel).toHaveBeenCalledWith(id, mockUser.actor.activityPubId);
    });
  });
});
