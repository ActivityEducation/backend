// src/features/educationpub/services/flashcard.service.ts
// Updated to implement CRUD for FlashcardEntity and interact with Outbox

import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { FlashcardEntity } from '../entities/flashcard.entity';
import { FlashcardModelEntity } from '../entities/flashcard-model.entity';
import { CreateFlashcardPayload } from '../dto/create-fashcard.dto';
import { UpdateFlashcardDto } from '../dto/update-flashcard.dto';
import { LoggerService } from 'src/shared/services/logger.service';
import { AppService } from 'src/core/services/app.service';
import { ActorEntity } from 'src/features/activitypub/entities/actor.entity';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { ActivityEntity } from 'src/features/activitypub/entities/activity.entity';
import { AnnounceEntity } from 'src/features/activitypub/entities/announce.entity';
import { LikeEntity } from 'src/features/activitypub/entities/like.entity';
import { ContentObjectEntity } from 'src/features/activitypub/entities/content-object.entity'; // For linking liked/announced objects if they are local
import { InferenceService } from 'src/features/knowledge-graph/services/inference.service';
import { KnowledgeGraphService } from 'src/features/knowledge-graph/services/knowledge-graph.service';

@Injectable()
export class FlashcardService {
  constructor(
    @InjectRepository(FlashcardEntity)
    private readonly flashcardRepository: Repository<FlashcardEntity>,
    @InjectRepository(FlashcardModelEntity)
    private readonly flashcardModelRepository: Repository<FlashcardModelEntity>,
    @InjectRepository(ActorEntity)
    private readonly actorRepository: Repository<ActorEntity>,
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: Repository<ActivityEntity>,
    @InjectRepository(AnnounceEntity) // Inject AnnounceEntity repository
    private readonly announceRepository: Repository<AnnounceEntity>,
    @InjectRepository(LikeEntity) // Inject LikeEntity repository
    private readonly likeRepository: Repository<LikeEntity>,
    @InjectRepository(ContentObjectEntity) // Needed if liked/announced objects are generic content objects
    private readonly contentObjectRepository: Repository<ContentObjectEntity>,
    @InjectQueue('outbox') private outboxQueue: Queue,
    private readonly logger: LoggerService,
    private readonly appService: AppService,
    private readonly inferenceService: InferenceService,
    private readonly knowledgeGraphService: KnowledgeGraphService,
  ) {
    this.logger.setContext('FlashcardService');
  }

  /**
   * Extracts a categorization-ready string from a flashcard,
   * using only the `text` fields defined by its `eduModel`.
   */
  public generateFlashcardTextStream(flashcard: FlashcardEntity): string {
    const eduModel = flashcard.eduModel;
    const fieldsData = flashcard.eduFieldsData;
    const outputParts: string[] = [];

    if (!eduModel || !Array.isArray(eduModel.fields) || !fieldsData) {
      return '';
    }

    for (const field of eduModel.fields) {
      const isTextField = field.type === 'text';
      const value = fieldsData[field.name];

      if (isTextField && typeof value === 'string' && value.trim() !== '') {
        outputParts.push(`${value}`.trim());
      }
    }

    return outputParts.join('; ');
  }

  public async findNodeIdForFlashcard(id: string) {
    return this.knowledgeGraphService.findNodeByProperties('Flashcard', { flashcardId: id });
  }

  public async recategorizeAllFlashcards() {
    this.logger.log('Clearing existing knowledge graph...');
    await this.knowledgeGraphService.clearGraph();

    this.logger.log('Fetching all flashcards to queue for recategorization...');
    const flashcards = await this.flashcardRepository.find({
      select: ['id'], // We only need the ID to queue the job
    });

    this.logger.log(`Queuing ${flashcards.length} flashcards for inference...`);
    for (const flashcard of flashcards) {
      try {
        // Queue the task instead of processing it directly
        await this.inferenceService.queueInferenceTask(flashcard.id);
      } catch (error) {
        this.logger.error(
          `Failed to queue flashcard ${flashcard.id}`,
          error.stack,
        );
      }
    }
    this.logger.log('All flashcards have been queued for processing.');
  }

  /**
   * Finds flashcards that are semantically related to a given flashcard
   * by traversing the knowledge graph to find shared topics.
   * @param flashcardId The ID of the flashcard to find relations for.
   * @returns A list of related flashcard IDs.
   */
  async getRelatedFlashcards(
    flashcardId: string,
    depth: number = 100,
  ): Promise<FlashcardEntity[]> {
    this.logger.log(`Finding related flashcards for ID: ${flashcardId}`);
    try {
      const relatedFlashcards =
        await this.knowledgeGraphService.findRelatedFlashcards(
          flashcardId,
          depth,
        );
      const flashcardIds = relatedFlashcards.map(
        (flashcard) => flashcard.flashcardId,
      );

      return this.flashcardRepository.find({
        where: { activityPubId: In(flashcardIds) },
        relations: [],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find related flashcards for ID: ${flashcardId}`,
        error.stack,
      );
      // Depending on requirements, you might want to return an empty array or re-throw
      return [];
    }
  }

  /**
   * Creates a new flashcard in the database and dispatches a 'Create' activity if public.
   * @param actorId Internal ID of the actor creating the flashcard.
   * @param createFlashcardDto DTO containing flashcard data.
   * @param isPublic Whether the flashcard should be public and federated.
   * @returns The created FlashcardEntity.
   */
  async createFlashcard(
    actorId: string, // Internal DB ID of the actor creating the flashcard
    createFlashcardDto: CreateFlashcardPayload,
    isPublic: boolean = false, // Default to private
  ): Promise<FlashcardEntity> {
    this.logger.log(`Attempting to create flashcard for actor ID: ${actorId}`);

    const creatorActor = await this.actorRepository.findOne({
      where: { id: actorId },
    });
    if (!creatorActor) {
      throw new NotFoundException(`Actor with ID '${actorId}' not found.`);
    }

    const flashcardModel = await this.flashcardModelRepository.findOne({
      where: { activityPubId: createFlashcardDto.eduModel },
    });
    if (!flashcardModel) {
      throw new NotFoundException(
        `Flashcard model with ActivityPub ID '${createFlashcardDto.eduModel}' not found.`,
      );
    }

    const flashcardActivityPubId = `${this.appService.getInstanceBaseUrl()}/objects/${randomUUID()}`;

    const newFlashcard = this.flashcardRepository.create({
      activityPubId: flashcardActivityPubId,
      name: createFlashcardDto.name,
      isPublic: isPublic,
      attributedToActivityPubId: creatorActor.activityPubId,
      creator: creatorActor,
      modelId: flashcardModel.id,
      eduModel: flashcardModel,
      eduFieldsData: createFlashcardDto.eduFieldsData,
      eduTags: createFlashcardDto.eduTags,
      eduTargetLanguage: createFlashcardDto.eduTargetLanguage,
      eduSourceLanguage: createFlashcardDto.eduSourceLanguage,
    });

    const savedFlashcard = await this.flashcardRepository.save(newFlashcard);
    this.logger.log(`Flashcard saved to DB: ${savedFlashcard.activityPubId}`);

    if (savedFlashcard.isPublic) {
      await this.dispatchCreateActivity(savedFlashcard, creatorActor);
    }

    return savedFlashcard;
  }

  /**
   * Retrieves all flashcards with pagination.
   * @param page Page number.
   * @param limit Items per page.
   * @returns Paginated list of FlashcardEntity.
   */
  async findAllFlashcardsPaginated(
    page: number,
    limit: number,
  ): Promise<[FlashcardEntity[], number]> {
    this.logger.debug(
      `Fetching all flashcards, page: ${page}, limit: ${limit}`,
    );
    return this.flashcardRepository.findAndCount({
      where: { deletedAt: IsNull() },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['eduModel', 'creator'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Finds a flashcard by its internal database ID.
   * @param id Internal database ID of the flashcard.
   * @returns The FlashcardEntity.
   */
  async findFlashcardById(id: string): Promise<FlashcardEntity> {
    this.logger.debug(`Fetching flashcard by ID: ${id}`);
    const flashcard = await this.flashcardRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['eduModel', 'creator'],
    });
    if (!flashcard) {
      throw new NotFoundException(
        `Flashcard with ID '${id}' not found or is deleted.`,
      );
    }
    return flashcard;
  }

  /**
   * Finds a flashcard by its ActivityPub ID.
   * @param activityPubId ActivityPub URI of the flashcard.
   * @returns The FlashcardEntity.
   */
  async findFlashcardByActivityPubId(
    activityPubId: string,
  ): Promise<FlashcardEntity> {
    this.logger.debug(`Fetching flashcard by ActivityPub ID: ${activityPubId}`);
    const flashcard = await this.flashcardRepository.findOne({
      where: { activityPubId, deletedAt: IsNull() },
      relations: ['eduModel', 'creator'],
    });
    if (!flashcard) {
      throw new NotFoundException(
        `Flashcard with ActivityPub ID '${activityPubId}' not found or is deleted.`,
      );
    }
    return flashcard;
  }

  /**
   * Updates an existing flashcard and dispatches an 'Update' activity if public.
   * @param id Internal database ID of the flashcard to update.
   * @param actorId Internal ID of the actor updating the flashcard.
   * @param updateFlashcardDto DTO containing update data.
   * @returns The updated FlashcardEntity.
   */
  async updateFlashcard(
    id: string,
    actorId: string, // Internal DB ID of the actor updating
    updateFlashcardDto: UpdateFlashcardDto,
  ): Promise<FlashcardEntity> {
    this.logger.log(
      `Attempting to update flashcard with ID: ${id} by actor ID: ${actorId}`,
    );

    const flashcard = await this.findFlashcardById(id);

    const updaterActor = await this.actorRepository.findOne({
      where: { id: actorId },
    });
    if (
      !updaterActor ||
      updaterActor.activityPubId !== flashcard.attributedToActivityPubId
    ) {
      // Only the original creator can update
      throw new NotFoundException(
        `Actor with ID '${actorId}' is not authorized to update this flashcard.`,
      );
    }

    if (updateFlashcardDto.eduModel) {
      const flashcardModel = await this.flashcardModelRepository.findOne({
        where: { activityPubId: updateFlashcardDto.eduModel },
      });
      if (!flashcardModel) {
        throw new NotFoundException(
          `Flashcard model with ActivityPub ID '${updateFlashcardDto.eduModel}' not found.`,
        );
      }
      flashcard.modelId = flashcardModel.id;
      flashcard.eduModel = flashcardModel;
    }

    Object.assign(flashcard, updateFlashcardDto); // Apply updates from DTO
    const updatedFlashcard = await this.flashcardRepository.save(flashcard);
    this.logger.log(`Flashcard updated: ${updatedFlashcard.id}`);

    // Dispatch Update activity if public
    if (updatedFlashcard.isPublic) {
      await this.dispatchUpdateActivity(updatedFlashcard, updaterActor);
    }

    return updatedFlashcard;
  }

  /**
   * Soft-deletes a flashcard and dispatches a 'Delete' activity if it was public.
   * @param id Internal database ID of the flashcard to delete.
   * @param actorId Internal ID of the actor deleting the flashcard.
   */
  async deleteFlashcard(
    id: string,
    actorId: string, // Internal DB ID of the actor deleting
  ): Promise<void> {
    this.logger.log(
      `Attempting to delete flashcard with ID: ${id} by actor ID: ${actorId}`,
    );

    const flashcard = await this.findFlashcardById(id);

    const deleterActor = await this.actorRepository.findOne({
      where: { id: actorId },
    });
    if (
      !deleterActor ||
      deleterActor.activityPubId !== flashcard.attributedToActivityPubId
    ) {
      // Only the original creator can delete
      throw new NotFoundException(
        `Actor with ID '${actorId}' is not authorized to delete this flashcard.`,
      );
    }

    // Soft delete the flashcard
    await this.flashcardRepository.softDelete(id);
    this.logger.log(`Flashcard soft-deleted from DB: ${id}`);

    // Dispatch Delete activity if it was public
    if (flashcard.isPublic) {
      await this.dispatchDeleteActivity(flashcard, deleterActor);
    }
  }

  /**
   * Handles a user 'liking' a flashcard. Creates a local Like record and dispatches a Like activity.
   * @param flashcardId The internal ID of the flashcard being liked.
   * @param localActorId The internal ID of the local actor performing the like.
   */
  async handleFlashcardLike(
    flashcardId: string,
    localActorId: string,
  ): Promise<{ message: string; liked: boolean }> {
    this.logger.log(
      `Actor ID '${localActorId}' attempting to like flashcard ID: ${flashcardId}`,
    );
    const flashcard = await this.findFlashcardById(flashcardId);
    const actor = await this.actorRepository.findOne({
      where: { id: localActorId },
    });
    if (!actor) {
      throw new NotFoundException(`Actor with ID '${localActorId}' not found.`);
    }

    // Check if the like already exists to prevent duplicates for local actions
    const existingLike = await this.likeRepository.findOne({
      where: {
        likerActivityPubId: actor.activityPubId,
        likedObjectActivityPubId: flashcard.activityPubId,
      },
    });

    if (existingLike) {
      this.logger.log(
        `Flashcard '${flashcardId}' already liked by actor '${localActorId}'. Skipping re-like.`,
      );
      throw new ConflictException(
        `Flashcard '${flashcardId}' already liked by this actor.`,
      );
    }

    // Save local like record
    const newLike = this.likeRepository.create({
      likerActivityPubId: actor.activityPubId,
      likedObjectActivityPubId: flashcard.activityPubId,
      liker: actor, // Link relationship
      likedObject: flashcard, // Link relationship
    });
    await this.likeRepository.save(newLike);
    this.logger.log(
      `Local like record created for flashcard '${flashcardId}' by actor '${localActorId}'.`,
    );

    // Dispatch the Like ActivityPub activity via FlashcardService
    await this.dispatchLikeActivity(actor, flashcard.activityPubId);

    return {
      message: 'Like activity enqueued for dispatch to Fediverse.',
      liked: true,
    };
  }

  /**
   * Handles a user 'boosting' (announcing) a flashcard. Creates a local Announce record and dispatches an Announce activity.
   * @param flashcardId The internal ID of the flashcard being boosted.
   * @param localActorId The internal ID of the local actor performing the boost.
   */
  async handleFlashcardBoost(
    flashcardId: string,
    localActorId: string,
  ): Promise<{ message: string; boosted: boolean }> {
    this.logger.log(
      `Actor ID '${localActorId}' attempting to boost flashcard ID: ${flashcardId}`,
    );
    const flashcard = await this.findFlashcardById(flashcardId);
    const actor = await this.actorRepository.findOne({
      where: { id: localActorId },
    });
    if (!actor) {
      throw new NotFoundException(`Actor with ID '${localActorId}' not found.`);
    }

    // Check if the boost already exists to prevent duplicates for local actions
    const existingAnnounce = await this.announceRepository.findOne({
      where: {
        announcerActivityPubId: actor.activityPubId,
        announcedObjectActivityPubId: flashcard.activityPubId,
      },
    });

    if (existingAnnounce) {
      this.logger.log(
        `Flashcard '${flashcardId}' already boosted by actor '${localActorId}'. Skipping re-boost.`,
      );
      throw new ConflictException(
        `Flashcard '${flashcardId}' already boosted by this actor.`,
      );
    }

    // Save local announce record
    const newAnnounce = this.announceRepository.create({
      announcerActivityPubId: actor.activityPubId,
      announcedObjectActivityPubId: flashcard.activityPubId,
      announcer: actor, // Link relationship
      announcedObject: flashcard, // Link relationship
    });
    await this.announceRepository.save(newAnnounce);
    this.logger.log(
      `Local announce record created for flashcard '${flashcardId}' by actor '${localActorId}'.`,
    );

    // Dispatch the Announce ActivityPub activity via FlashcardService
    await this.dispatchAnnounceActivity(actor, flashcard.activityPubId);

    return {
      message: 'Announce activity enqueued for dispatch to Fediverse.',
      boosted: true,
    };
  }

  // --- ActivityPub Dispatch Methods (private helpers) ---

  async dispatchCreateActivity(
    flashcard: FlashcardEntity,
    actor: ActorEntity,
  ): Promise<void> {
    const activityUUID = randomUUID();
    const createActivityId = `${this.appService.getInstanceBaseUrl()}/activities/${activityUUID}`;

    const flashcardContent =
      `Flashcard: ${flashcard.name}<br /><br />` +
      Object.entries(flashcard.eduFieldsData)
        .map(([key, value]) => `${key}: ${value}`)
        .join('<br />');

    const activityObject = {
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        'https://social.bleauweb.org/ns/education-pub',
        'https://w3id.org/security/v1',
      ],
      id: flashcard.activityPubId,
      type: ['edu:Flashcard', 'Note'], // Flashcard can also be a Note
      attributedTo: actor.activityPubId,
      published: flashcard.createdAt.toISOString(),
      content: flashcardContent,
      name: flashcard.name,
      'edu:model': flashcard.eduModel.activityPubId,
      'edu:fieldsData': flashcard.eduFieldsData,
      ...(flashcard.eduTags && { 'edu:tags': flashcard.eduTags }),
      ...(flashcard.eduTargetLanguage && {
        'edu:targetLanguage': flashcard.eduTargetLanguage,
      }),
      ...(flashcard.eduSourceLanguage && {
        'edu:sourceLanguage': flashcard.eduSourceLanguage,
      }),
    };

    const createActivityPayload = {
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        'https://social.bleauweb.org/ns/education-pub',
        'https://w3id.org/security/v1',
      ],
      id: createActivityId,
      type: 'Create',
      actor: actor.activityPubId,
      object: activityObject, // Embed the full object here
      to: ['https://www.w3.org/ns/activitystreams#Public'],
      published: new Date().toISOString(),
    };

    const newActivityEntity = this.activityRepository.create({
      id: activityUUID,
      activityPubId: createActivityPayload.id,
      type: createActivityPayload.type,
      actorActivityPubId: createActivityPayload.actor,
      objectActivityPubId: String((createActivityPayload.object as any).id), // Store the object's AP ID
      data: createActivityPayload,
      actor: actor,
    });
    const savedActivity = await this.activityRepository.save(newActivityEntity);

    await this.outboxQueue.add(
      'deliver-activity',
      {
        activityId: savedActivity.id,
        activity: savedActivity.data,
        actorId: actor.id,
      },
      {
        jobId: savedActivity.id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    this.logger.log(
      `'Create' activity enqueued for flashcard: ${flashcard.activityPubId}`,
    );
  }

  async dispatchUpdateActivity(
    flashcard: FlashcardEntity,
    actor: ActorEntity,
  ): Promise<void> {
    const activityUUID = randomUUID();
    const updateActivityId = `${this.appService.getInstanceBaseUrl()}/activities/${activityUUID}`;

    const flashcardContent =
      `Flashcard: ${flashcard.name}\n\n` +
      Object.entries(flashcard.eduFieldsData)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');

    const activityObject = {
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        'https://social.bleauweb.org/ns/education-pub',
        'https://w3id.org/security/v1',
      ],
      id: flashcard.activityPubId,
      type: ['edu:Flashcard', 'Note'],
      attributedTo: actor.activityPubId,
      updated: new Date().toISOString(), // Use 'updated' timestamp
      content: flashcardContent,
      name: flashcard.name,
      'edu:model': flashcard.eduModel.activityPubId,
      'edu:fieldsData': flashcard.eduFieldsData,
      ...(flashcard.eduTags && { 'edu:tags': flashcard.eduTags }),
      ...(flashcard.eduTargetLanguage && {
        'edu:targetLanguage': flashcard.eduTargetLanguage,
      }),
      ...(flashcard.eduSourceLanguage && {
        'edu:sourceLanguage': flashcard.eduSourceLanguage,
      }),
    };

    const updateActivityPayload = {
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        'https://social.bleauweb.org/ns/education-pub',
        'https://w3id.org/security/v1',
      ],
      id: updateActivityId,
      type: 'Update',
      actor: actor.activityPubId,
      object: activityObject,
      to: ['https://www.w3.org/ns/activitystreams#Public'],
      updated: new Date().toISOString(),
    };

    const newActivityEntity = this.activityRepository.create({
      id: activityUUID,
      activityPubId: updateActivityPayload.id,
      type: updateActivityPayload.type,
      actorActivityPubId: updateActivityPayload.actor,
      objectActivityPubId: String((updateActivityPayload.object as any).id),
      data: updateActivityPayload,
      actor: actor,
    });
    const savedActivity = await this.activityRepository.save(newActivityEntity);

    await this.outboxQueue.add(
      'deliver-activity',
      {
        activityId: savedActivity.id,
        activity: savedActivity.data,
        actorId: actor.id,
      },
      {
        jobId: savedActivity.id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    this.logger.log(
      `'Update' activity enqueued for flashcard: ${flashcard.activityPubId}`,
    );
  }

  async dispatchDeleteActivity(
    flashcard: FlashcardEntity,
    actor: ActorEntity,
  ): Promise<void> {
    const activityUUID = randomUUID();
    const deleteActivityId = `${this.appService.getInstanceBaseUrl()}/activities/${activityUUID}`;

    const deleteActivityPayload = {
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        'https://social.bleauweb.org/ns/education-pub',
        'https://w3id.org/security/v1',
      ],
      id: deleteActivityId,
      type: 'Delete',
      actor: actor.activityPubId,
      object: flashcard.activityPubId, // Reference the ID of the deleted object
      to: ['https://www.w3.org/ns/activitystreams#Public'],
      published: new Date().toISOString(),
    };

    const newActivityEntity = this.activityRepository.create({
      id: activityUUID,
      activityPubId: deleteActivityPayload.id,
      type: deleteActivityPayload.type,
      actorActivityPubId: deleteActivityPayload.actor,
      objectActivityPubId: deleteActivityPayload.object,
      data: deleteActivityPayload,
      actor: actor,
    });
    const savedActivity = await this.activityRepository.save(newActivityEntity);

    await this.outboxQueue.add(
      'deliver-activity',
      {
        activityId: savedActivity.id,
        activity: savedActivity.data,
        actorId: actor.id,
      },
      {
        jobId: savedActivity.id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    this.logger.log(
      `'Delete' activity enqueued for flashcard: ${flashcard.activityPubId}`,
    );
  }

  async dispatchLikeActivity(
    actor: ActorEntity,
    objectToLikeUri: string,
  ): Promise<void> {
    this.logger.log(
      `Actor '${actor.activityPubId}' dispatching Like for object: ${objectToLikeUri}`,
    );
    const activityUUID = randomUUID();
    const likeActivityId = `${this.appService.getInstanceBaseUrl()}/activities/${activityUUID}`;

    const likeActivityPayload = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: likeActivityId,
      type: 'Like',
      actor: actor.activityPubId,
      object: objectToLikeUri,
      to: [objectToLikeUri], // Send to the object's owner/origin server
      published: new Date().toISOString(),
    };

    const newActivityEntity = this.activityRepository.create({
      id: activityUUID,
      activityPubId: likeActivityPayload.id,
      type: likeActivityPayload.type,
      actorActivityPubId: likeActivityPayload.actor,
      objectActivityPubId: likeActivityPayload.object,
      data: likeActivityPayload,
      actor: actor,
    });
    const savedActivity = await this.activityRepository.save(newActivityEntity);

    await this.outboxQueue.add(
      'deliver-activity',
      {
        activityId: savedActivity.id,
        activity: savedActivity.data,
        actorId: actor.id,
      },
      {
        jobId: savedActivity.id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    this.logger.log(`'Like' activity enqueued for object: ${objectToLikeUri}`);
  }

  async dispatchAnnounceActivity(
    actor: ActorEntity,
    objectToAnnounceUri: string,
  ): Promise<void> {
    this.logger.log(
      `Actor '${actor.activityPubId}' dispatching Announce for object: ${objectToAnnounceUri}`,
    );
    const activityUUID = randomUUID();
    const announceActivityId = `${this.appService.getInstanceBaseUrl()}/activities/${activityUUID}`;

    const announceActivityPayload = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: announceActivityId,
      type: 'Announce',
      actor: actor.activityPubId,
      object: objectToAnnounceUri,
      to: ['https://www.w3.org/ns/activitystreams#Public'], // Announce is typically public
      published: new Date().toISOString(),
    };

    const newActivityEntity = this.activityRepository.create({
      id: activityUUID,
      activityPubId: announceActivityPayload.id,
      type: announceActivityPayload.type,
      actorActivityPubId: announceActivityPayload.actor,
      objectActivityPubId: announceActivityPayload.object,
      data: announceActivityPayload,
      actor: actor,
    });
    const savedActivity = await this.activityRepository.save(newActivityEntity);

    await this.outboxQueue.add(
      'deliver-activity',
      {
        activityId: savedActivity.id,
        activity: savedActivity.data,
        actorId: actor.id,
      },
      {
        jobId: savedActivity.id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    this.logger.log(
      `'Announce' activity enqueued for object: ${objectToAnnounceUri}`,
    );
  }
}
