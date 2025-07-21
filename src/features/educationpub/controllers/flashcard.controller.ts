import {
  Controller,
  Post,
  Get,
  Param,
  NotFoundException,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { randomUUID } from 'crypto';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'; // Import Swagger decorators

import { Activity } from 'src/shared/decorators/activity.decorator';
import { ActorEntity } from 'src/features/activitypub/entities/actor.entity';
import { ContentObjectEntity } from 'src/features/activitypub/entities/content-object.entity';
import { AppService } from 'src/core/services/app.service';
import { LoggerService } from 'src/shared/services/logger.service';
import { ConfigService } from '@nestjs/config';
import { ActivityEntity } from 'src/features/activitypub/entities/activity.entity';
import { CreateFlashcardPayload } from '../dto/create-fashcard.dto';
import { Flashcard } from '../views/flashcard.view';

@ApiTags('EducationPub') // Tag for Swagger UI organization
@Controller('edu/flashcards')
export class EducationPubController {
  private readonly instanceBaseUrl: string;

  constructor(
    @InjectRepository(Flashcard)
    private readonly flashcardRepository: Repository<Flashcard>,
    @InjectRepository(ActorEntity)
    private readonly actorRepository: Repository<ActorEntity>,
    @InjectRepository(ContentObjectEntity)
    private readonly contentObjectRepository: Repository<ContentObjectEntity>,
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: Repository<ActivityEntity>,
    @InjectQueue('outbox') private outboxQueue: Queue,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('EducationPubController');
    const baseUrl = this.configService.get<string>('INSTANCE_BASE_URL');
    if (!baseUrl) {
      this.logger.error(
        'INSTANCE_BASE_URL is not defined in environment variables.',
      );
      throw new Error('INSTANCE_BASE_URL is not defined.');
    }
    this.instanceBaseUrl = baseUrl;
  }

  @Get()
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOkResponse({ type: [Flashcard] })
  public getFlashcards() {
    return this.flashcardRepository.find();
  }

  /**
   * Creates a new EducationPub Flashcard for a specified user.
   * Saves the flashcard to the database and sends a 'Create' activity to the Fediverse.
   *
   * @param username The preferred username of the actor creating the flashcard.
   * @param flashcardPayload The incoming flashcard data (parsed by @Activity() decorator).
   * @returns The created flashcard object with its ActivityPub ID.
   */
  @Post(':username')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new EducationPub Flashcard for a user' })
  @ApiParam({
    name: 'username',
    description: 'The preferred username of the actor creating the flashcard.',
  })
  @ApiBody({
    type: CreateFlashcardPayload,
    description:
      'The JSON-LD payload for the new flashcard. Ensure @context and @type are correctly set.',
    examples: {
      aFlashcard: {
        value: {
          '@context': [
            'https://www.w3.org/ns/activitystreams',
            'https://social.bleauweb.org/ns/education-pub',
          ],
          id: `http://localhost/objects/${randomUUID()}`,
          type: ['edu:Flashcard', 'Note'],
          name: 'My First French Word',
          'edu:model':
            'https://social.bleauweb.org/flashcard-models/basic-vocab',
          'edu:fieldsData': {
            Front: 'Bonjour',
            Back: 'Hello',
            'Example Sentence': 'Bonjour, comment ça va?',
          },
          'edu:tags': ['French', 'Greetings'],
          'edu:targetLanguage': 'fr',
          'edu:sourceLanguage': 'en',
        },
        summary: 'Example Flashcard Creation',
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Flashcard created and enqueued for Fediverse delivery.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request (e.g., invalid JSON-LD payload).',
  })
  @ApiResponse({ status: 404, description: 'Actor not found.' })
  @ApiResponse({ status: 500, description: 'Internal server error.' })
  async createFlashcard(
    @Param('username') username: string,
    @Activity() flashcardPayload: any, // Changed type to 'any' to bypass ValidationPipe for raw JSON-LD
  ): Promise<any> {
    this.logger.log(
      `Received request to create flashcard for user: ${username}`,
    );

    const actor = await this.actorRepository.findOne({
      where: { preferredUsername: username },
    });

    if (!actor) {
      throw new NotFoundException(
        `Actor with username '${username}' not found.`,
      );
    }

    const flashcardActivityPubId = flashcardPayload.id ?? `${this.instanceBaseUrl}/objects/${randomUUID()}`;

    const newFlashcard = new ContentObjectEntity();
    newFlashcard.activityPubId = flashcardActivityPubId;
    newFlashcard.type = 'Flashcard';
    newFlashcard.attributedToActivityPubId = actor.activityPubId;

    const flashcardName = flashcardPayload.name || 'Untitled Flashcard';
    const flashcardFields = flashcardPayload.eduFieldsData || {};

    const flashcardContent =
      `Flashcard: ${flashcardName}\n\n` +
      Object.entries(flashcardFields)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');

    newFlashcard.data = {
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        'https://social.bleauweb.org/ns/education-pub',
        'https://w3id.org/security/v1',
      ],
      '@type': ['edu:Flashcard', 'Note'],
      id: flashcardActivityPubId,
      attributedTo: actor.activityPubId,
      published: new Date().toISOString(),
      content: flashcardContent,
      ...flashcardPayload,
    };

    try {
      const savedFlashcard =
        await this.contentObjectRepository.save(newFlashcard);
      this.logger.log(`Flashcard saved to DB: ${savedFlashcard.activityPubId}`);

      const activityUUID = randomUUID();
      const createActivityId = `${this.instanceBaseUrl}/activities/${activityUUID}`;
      const createActivityPayload = {
        // Renamed to avoid conflict with ActivityEntity instance
        '@context': [
          'https://www.w3.org/ns/activitystreams',
          'https://social.bleauweb.org/ns/education-pub',
          'https://w3id.org/security/v1',
        ],
        id: createActivityId,
        type: 'Create',
        actor: actor.activityPubId,
        object: savedFlashcard.activityPubId,
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        published: new Date().toISOString(),
      };

      // NEW: Save the Create activity to the database
      const newActivityEntity = this.activityRepository.create({
        id: activityUUID,
        activityPubId: createActivityPayload.id,
        type: createActivityPayload.type,
        actorActivityPubId: createActivityPayload.actor,
        objectActivityPubId: createActivityPayload.object,
        data: createActivityPayload,
        actor: actor, // Link to the local actor entity
      });
      const savedActivity =
        await this.activityRepository.save(newActivityEntity);
      this.logger.log(
        `Create Activity saved to DB: ${savedActivity.activityPubId}`,
      );

      // Enqueue the 'Create' activity to the outbox for delivery
      await this.outboxQueue.add(
        'deliver-activity',
        {
          activityId: savedActivity.id, // IMPORTANT: Pass the internal ID of the saved ActivityEntity
          activity: savedActivity.data, // Pass the full JSON-LD payload from the saved entity
          actorId: actor.id,
        },
        {
          jobId: savedActivity.id, // Use the internal ID of the saved activity as job ID for traceability
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );
      this.logger.log(
        `'Create' activity enqueued for flashcard: ${savedFlashcard.activityPubId}`,
      );

      return {
        message: 'Flashcard created and enqueued for Fediverse delivery.',
        flashcard: savedFlashcard.data,
        activity: savedActivity.data, // Optionally return the created activity data
      };
    } catch (error) {
      this.logger.error(
        `Error creating flashcard: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to create flashcard and send activity.',
      );
    }
  }

  /**
   * Deletes all EducationPub Flashcards for a specified user.
   * Sends a 'Delete' activity for each deleted flashcard to the Fediverse.
   *
   * NOTE: As per request, this is a GET endpoint. In a RESTful API, a DELETE method
   * would typically be used for this operation.
   *
   * @param username The preferred username of the actor whose flashcards are to be deleted.
   * @returns A confirmation message with the count of deleted flashcards.
   */
  @Get('delete-all/:username')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete all EducationPub Flashcards for a user' })
  @ApiParam({
    name: 'username',
    description:
      'The preferred username of the actor whose flashcards are to be deleted.',
  })
  @ApiResponse({
    status: 200,
    description: 'Flashcards deleted and delete activities enqueued.',
  })
  @ApiResponse({ status: 404, description: 'Actor not found.' })
  @ApiResponse({ status: 500, description: 'Internal server error.' })
  async deleteAllFlashcards(@Param('username') username: string): Promise<any> {
    this.logger.log(
      `Received request to delete all flashcards for user: ${username}`,
    );

    const actor = await this.actorRepository.findOne({
      where: { preferredUsername: username },
    });

    if (!actor) {
      throw new NotFoundException(
        `Actor with username '${username}' not found.`,
      );
    }

    const flashcardsToDelete = await this.contentObjectRepository.find({
      where: {
        attributedToActivityPubId: actor.activityPubId,
        type: 'Flashcard',
        deletedAt: IsNull(),
      },
    });

    if (flashcardsToDelete.length === 0) {
      this.logger.log(`No flashcards found to delete for user: ${username}`);
      return {
        message: `No flashcards found for user '${username}' to delete.`,
      };
    }

    let deletedCount = 0;
    const deletePromises: Promise<any>[] = [];

    for (const flashcard of flashcardsToDelete) {
      deletePromises.push(
        (async () => {
          try {
            flashcard.deletedAt = new Date();
            await this.contentObjectRepository.save(flashcard);
            this.logger.log(
              `Flashcard soft-deleted from DB: ${flashcard.activityPubId}`,
            );

            const deleteActivityId = `${this.instanceBaseUrl}/activities/${randomUUID()}`;
            const deleteActivity = {
              '@context': [
                'https://www.w3.org/ns/activitystreams',
                'https://social.bleauweb.org/ns/education-pub',
                'https://w3id.org/security/v1',
              ],
              id: deleteActivityId,
              type: 'Delete',
              actor: actor.activityPubId,
              object: flashcard.activityPubId,
              to: ['https://www.w3.org/ns/activitystreams#Public'],
              published: new Date().toISOString(),
            };

            await this.outboxQueue.add(
              'deliver-activity',
              {
                activityId: null,
                activity: deleteActivity,
                actorId: actor.id,
              },
              {
                jobId: deleteActivityId,
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
              },
            );
            this.logger.log(
              `'Delete' activity enqueued for flashcard: ${flashcard.activityPubId}`,
            );
            deletedCount++;
          } catch (error) {
            this.logger.error(
              `Error processing deletion for flashcard ${flashcard.activityPubId}: ${error.message}`,
              error.stack,
            );
          }
        })(),
      );
    }

    await Promise.allSettled(deletePromises);

    return {
      message: `Attempted to delete ${deletedCount} flashcards for user '${username}' and enqueued delete activities.`,
      deletedCount: deletedCount,
    };
  }
}
