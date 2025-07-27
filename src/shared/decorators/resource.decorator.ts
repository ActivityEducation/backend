// src/shared/decorators/resource.decorator.ts
import { createParamDecorator, ExecutionContext, NotFoundException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { LoggerService } from '../services/logger.service';
import { getNestedProperty } from '../utils/object-property-accessor'; // Import the utility
import { ModuleRef } from '@nestjs/core'; // Import ModuleRef

/**
 * Custom parameter decorator to fetch a resource entity by ID from the database.
 * The fetched entity is then attached to `req.resource` for use by `AbilitiesGuard`
 * for resource-scoped permission checks.
 *
 * Usage:
 * @Put(':id')
 * @UseGuards(JwtAuthGuard, AbilitiesGuard)
 * @CheckAbilities({ action: 'update', subject: FlashcardEntity.name, conditions: { creator: { id: '{{user.id}}' } } })
 * async updateFlashcard(
 * @Param('id') id: string,
 * @Resource(FlashcardEntity, 'params.id') flashcard: FlashcardEntity, // Fetches Flashcard by ID from param 'id'
 * @Body() updateDto: UpdateFlashcardDto
 * ) { ... }
 *
 * @param entityClass The TypeORM entity class (e.g., FlashcardEntity) to fetch.
 * @param idPath A string path to the resource ID within the request (e.g., 'params.id', 'query.resourceId', 'body.id'). Defaults to 'params.id'.
 */
export const Resource = (entityClass: any, idPath: string = 'params.id') =>
  createParamDecorator(async (data: unknown, ctx: ExecutionContext) => { 
    // Get ModuleRef from the application context via the request object
    // This is a common workaround when direct injection into createParamDecorator's factory isn't working as expected.
    const request = ctx.switchToHttp().getRequest<Request>();
    const app = request.app as any; // Cast to 'any' to access NestJS's 'get' method
    const moduleRef = app.get(ModuleRef); 

    const logger = moduleRef.get(LoggerService); // Get LoggerService via ModuleRef
    logger.setContext('ResourceDecorator'); // Set context for the logger

    // Extract resourceId using the provided path
    const resourceId = getNestedProperty(request, idPath);

    if (!resourceId) {
      logger.error(`ResourceDecorator: Missing ID at path '${idPath}' for resource type ${entityClass.name}.`);
      throw new BadRequestException(`Resource ID at path '${idPath}' is required.`);
    }

    try {
      // Access the repository using ModuleRef
      const repository: Repository<any> = moduleRef.get(getRepositoryToken(entityClass), { strict: false });

      if (!repository) {
        logger.error(`ResourceDecorator: TypeORM repository for entity '${entityClass.name}' not found. Ensure it's registered with TypeORM.`);
        throw new InternalServerErrorException(`TypeORM repository for entity '${entityClass.name}' not found.`);
      }

      const resource = await repository.findOne({
        where: { id: resourceId },
        relations: ['creator', 'user', 'actor', 'eduModel'], // Common relations for ownership checks, and for Flashcards
      });

      if (!resource) {
        logger.warn(`ResourceDecorator: Resource of type '${entityClass.name}' with ID '${resourceId}' not found.`);
        throw new NotFoundException(`${entityClass.name} with ID '${resourceId}' not found.`);
      }

      (request as any).resource = resource;
      logger.debug(`ResourceDecorator: Fetched and attached resource of type '${entityClass.name}' with ID '${resourceId}'.`);
      return resource;
    } catch (error) {
      logger.error(`ResourceDecorator: Failed to fetch resource of type '${entityClass.name}' with ID '${resourceId}': ${error.message}`, error.stack);
      if (error instanceof NotFoundException || error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to retrieve resource for authorization.`);
    }
  })();
