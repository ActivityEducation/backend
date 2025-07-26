// src/features/activitypub/activity-handler/handlers/update.handler.ts

import { IActivityHandler } from '../interfaces/activity-handler.interface';
import { ActivityHandler } from '../../../../shared/decorators/activity-handler.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContentObjectEntity } from '../../entities/content-object.entity';
import { LoggerService } from 'src/shared/services/logger.service';
import { FlashcardEntity } from 'src/features/educationpub/entities/flashcard.entity';
import { FlashcardModelEntity } from 'src/features/educationpub/entities/flashcard-model.entity';
import { FlashcardService } from 'src/features/educationpub/services/flashcard.service';
import { FlashcardModelService } from 'src/features/educationpub/services/flashcard-model.service';
import { RemoteObjectService } from 'src/core/services/remote-object.service';

/**
 * UpdateHandler
 *
 * Handles incoming 'Update' activities from the ActivityPub inbox.
 * This handler is responsible for processing updates to existing objects (e.g., Notes, edu:Flashcards).
 * It will identify the updated object and apply the changes to its local representation.
 */
@ActivityHandler('Update')
export class UpdateHandler implements IActivityHandler {
  public readonly type = 'Update';

  constructor(
    @InjectRepository(ContentObjectEntity)
    private readonly contentObjectRepository: Repository<ContentObjectEntity>,
    @InjectRepository(FlashcardEntity)
    private readonly flashcardRepository: Repository<FlashcardEntity>, // To update flashcards
    private readonly logger: LoggerService, // Injects custom logger
    private readonly flashcardService: FlashcardService, // For flashcard-specific updates
    private readonly flashcardModelService: FlashcardModelService, // For flashcard-model-specific updates
    private readonly remoteObjectService: RemoteObjectService, // To fetch full object if needed
  ) {
    this.logger.setContext('UpdateHandler');
  }

  /**
   * Handles an incoming 'Update' activity received in the inbox.
   *
   * @param activity The parsed ActivityPub activity object.
   */
  async handleInbox(activity: any): Promise<void> {
    this.logger.debug(`Received Update activity: ${JSON.stringify(activity)}`);

    const actorActivityPubId = String(activity.actorActivityPubId);
    const updatedObject = activity.data.object; // The object that was updated

    if (!updatedObject || !updatedObject.id) {
      this.logger.warn(
        `Update activity from '${actorActivityPubId}' has no object or object ID. Skipping processing.`,
      );
      return;
    }

    const updatedObjectId = String(updatedObject.id);
    const updatedObjectType = Array.isArray(updatedObject.type)
      ? updatedObject.type
      : [updatedObject.type]; // Ensure type is an array

    this.logger.log(
      `Handling 'Update' activity from '${actorActivityPubId}' for object '${updatedObjectId}' (Type: ${updatedObjectType}).`,
    );

    // --- Handle edu:Flashcard updates ---
    if (updatedObjectType.includes('edu:Flashcard')) {
      this.logger.log(`Detected edu:Flashcard object in Update activity. Attempting to update local record.`);
      try {
        let localFlashcard = await this.flashcardService.findFlashcardByActivityPubId(updatedObjectId);

        if (localFlashcard) {
          // Verify that the updater is the original attributedTo actor
          if (localFlashcard.attributedToActivityPubId !== actorActivityPubId) {
            this.logger.warn(`Received Update for Flashcard '${updatedObjectId}' from an unauthorized actor '${actorActivityPubId}'. Expected '${localFlashcard.attributedToActivityPubId}'. Skipping update.`);
            return;
          }

          // Update the properties of the local flashcard entity
          localFlashcard.name = updatedObject.name || localFlashcard.name;
          localFlashcard.eduFieldsData = updatedObject['edu:fieldsData'] || localFlashcard.eduFieldsData;
          localFlashcard.eduTags = updatedObject['edu:tags'] || localFlashcard.eduTags;
          localFlashcard.eduTargetLanguage = updatedObject['edu:targetLanguage'] || localFlashcard.eduTargetLanguage;
          localFlashcard.eduSourceLanguage = updatedObject['edu:sourceLanguage'] || localFlashcard.eduSourceLanguage;

          // If edu:model is updated, try to link to local model or fetch/store remote model
          if (updatedObject['edu:model']) {
            let flashcardModelEntity = await this.flashcardModelService.findModelByActivityPubId(String(updatedObject['edu:model'])).catch(() => null);
            if (!flashcardModelEntity) {
              // Try to fetch remote model and store it
              const remoteModelData = await this.remoteObjectService.fetchRemoteObject(String(updatedObject['edu:model']));
              if (remoteModelData) {
                  flashcardModelEntity = await this.flashcardModelService.createFlashcardModel({
                      name: remoteModelData.name || 'Federated Model',
                      summary: remoteModelData.summary,
                      eduFields: remoteModelData['edu:fields'] || [],
                      eduCardTemplates: remoteModelData['edu:cardTemplates'] || [],
                      eduStylingCSS: remoteModelData['edu:stylingCSS']
                  });
                  flashcardModelEntity.activityPubId = String(updatedObject['edu:model']);
                  await this.flashcardModelService.updateFlashcardModel(flashcardModelEntity.id, flashcardModelEntity);
                  this.logger.log(`Federated FlashcardModel '${flashcardModelEntity.activityPubId}' fetched and stored during Flashcard Update.`);
              }
            }
            if (flashcardModelEntity) {
              localFlashcard.modelId = flashcardModelEntity.id;
              localFlashcard.eduModel = flashcardModelEntity;
            } else {
                this.logger.warn(`Could not resolve edu:model '${updatedObject['edu:model']}' for flashcard update.`);
            }
          }

          await this.flashcardRepository.save(localFlashcard);
          this.logger.log(`Updated local edu:Flashcard (ID: '${localFlashcard.activityPubId}').`);
        } else {
          this.logger.warn(`Local edu:Flashcard '${updatedObjectId}' not found. Cannot apply update. Consider fetching the full object if it's new.`);
          // If the object is not found, it might be a new object created by a remote instance
          // that our instance hasn't seen yet. A full fetch might be warranted.
          await this.remoteObjectService.fetchAndStoreRemoteObject(updatedObjectId);
        }
      } catch (e) {
        this.logger.error(`Error updating local edu:Flashcard '${updatedObjectId}': ${e.message}`, e.stack);
      }
    }
    // --- Handle generic ContentObject updates (e.g., Note) ---
    else if (updatedObjectType.includes('Note') || updatedObjectType.includes('Document')) {
        this.logger.log(`Detected generic ContentObject (Note/Document) in Update activity. Attempting to update local record.`);
        try {
            let localContentObject = await this.contentObjectRepository.findOne({ where: { activityPubId: updatedObjectId } });
            if (localContentObject) {
                // Apply updates to the generic content object
                localContentObject.data = { ...localContentObject.data, ...updatedObject };
                // Optionally update summary, content directly if they are common fields
                // localContentObject.summary = updatedObject.summary || localContentObject.summary;
                // localContentObject.content = updatedObject.content || localContentObject.content;

                await this.contentObjectRepository.save(localContentObject);
                this.logger.log(`Updated local generic ContentObject (ID: '${localContentObject.activityPubId}').`);
            } else {
                this.logger.warn(`Local generic ContentObject '${updatedObjectId}' not found. Cannot apply update. Attempting to fetch.`);
                // Attempt to fetch the full object as it might be a new remote object we missed
                await this.remoteObjectService.fetchAndStoreRemoteObject(updatedObjectId);
            }
        } catch (e) {
            this.logger.error(`Error updating local generic ContentObject '${updatedObjectId}': ${e.message}`, e.stack);
        }
    } else {
        this.logger.warn(`Update activity for unhandled object type '${updatedObjectType}' (ID: '${updatedObjectId}'). Skipping specific update logic.`);
        // For unhandled types, you might still want to fetch the object to cache its latest state
        await this.remoteObjectService.fetchAndStoreRemoteObject(updatedObjectId);
    }
    return;
  }

  /**
   * Handles outgoing 'Update' activities from the outbox.
   * (Typically, this handler would not perform direct actions; the outbox processor
   * handles the actual dispatching based on the activity data prepared by a service.)
   *
   * @param activity The parsed ActivityPub activity object.
   */
  async handleOutbox(activity: any): Promise<void> {
    this.logger.log('Handling outbox Update activity (no specific action here, outbox processor dispatches).');
    // For an 'Update' activity being sent from the outbox, the main action
    // (updating the local record and queuing the activity) is typically
    // performed by a service (e.g., FlashcardService.dispatchUpdateActivity)
    // before it reaches the OutboxProcessor.
  }
}
