import { IActivityHandler } from '../interfaces/activity-handler.interface';
import { ActivityHandler } from '../../../../shared/decorators/activity-handler.decorator';
import { ModerationService } from 'src/features/moderation/moderation.service';
import { LoggerService } from 'src/shared/services/logger.service';

@ActivityHandler('Flag')
export class FlagHandler implements IActivityHandler {
  public readonly type = 'Flag';

  constructor(
    private readonly moderationService: ModerationService, // Inject your moderation service here
    private readonly logger: LoggerService, // Injects custom logger
  ) {
    this.logger.setContext('FlagHandler');
  }

  async handleInbox(activity: any): Promise<void> {
    this.logger.debug(`Received Flag activity: ${JSON.stringify(activity)}`);
    
    const actorActivityPubId = String(activity.actorActivityPubId);
    const objectActivityPubId = typeof activity.objectActivityPubId === 'string' ? String(activity.objectActivityPubId) : undefined;
    
    this.logger.log(
      `Handling 'Flag' activity from '${actorActivityPubId}' for object: '${objectActivityPubId}'.`,
    );
    if (objectActivityPubId) {
      // Production Grade Improvement: Trigger moderation workflow.
      // The 'category' of the flag could be inferred from the activity data or a separate field.
      const flagCategory = activity.data.category || 'unspecified'; // Example: use a 'category' field in the flag activity
      await this.moderationService.flagObject(
        objectActivityPubId,
        actorActivityPubId,
        flagCategory,
        activity.data,
      );
      this.logger.log(
        `Object '${objectActivityPubId}' flagged by '${actorActivityPubId}' with category '${flagCategory}'. Details enqueued for moderation review.`,
      );
    } else {
      this.logger.warn(
        `Flag activity from '${actorActivityPubId}' missing object ID. Skipping processing.`,
      );
    }
    return;
  }

  async handleOutbox(activity: any): Promise<void> {
    console.log('Handling outbox Flag activity:', activity);
  }
}
