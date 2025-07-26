import { Repository } from 'typeorm';
import { IActivityHandler } from '../interfaces/activity-handler.interface';
import { ActivityHandler } from '../../../../shared/decorators/activity-handler.decorator';
import { BlockEntity } from '../../entities/block.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { LoggerService } from 'src/shared/services/logger.service';

@ActivityHandler('Block')
export class BlockHandler implements IActivityHandler {
  public readonly type = 'Block';

  constructor(
    @InjectRepository(BlockEntity)
    private readonly blockRepository: Repository<BlockEntity>,
    private readonly logger: LoggerService, // Injects custom logger
  ) {
    this.logger.setContext('BlockHandler'); // Sets context for the logger
  }

  async handleInbox(activity: any): Promise<void> {
    this.logger.debug(`Received Block activity: ${JSON.stringify(activity)}`);

    const actorActivityPubId = String(activity.actorActivityPubId);
    const objectActivityPubId =
      typeof activity.objectActivityPubId === 'string'
        ? String(activity.objectActivityPubId)
        : undefined;

    this.logger.log(
      `Handling 'Block' activity from '${actorActivityPubId}' for object: '${objectActivityPubId}'.`,
    );
    if (objectActivityPubId) {
      // Check if this block relationship already exists
      const existingBlock = await this.blockRepository.findOne({
        where: {
          blockerActivityPubId: actorActivityPubId,
          blockedActivityPubId: objectActivityPubId,
        },
      });

      if (!existingBlock) {
        // Store the new Block relationship
        const newBlock = this.blockRepository.create({
          blockerActivityPubId: actorActivityPubId,
          blockedActivityPubId: objectActivityPubId,
        });
        await this.blockRepository.save(newBlock);
        this.logger.log(
          `Stored new Block relationship: '${actorActivityPubId}' blocked '${objectActivityPubId}'.`,
        );
      } else {
        this.logger.log(
          `Block relationship already exists: '${actorActivityPubId}' blocked '${objectActivityPubId}'. No new action taken.`,
        );
      }
    } else {
      this.logger.warn(
        `Block activity from '${actorActivityPubId}' missing object (blocked actor) ID. Skipping processing.`,
      );
    }
    return;
  }

  async handleOutbox(activity: any): Promise<void> {
    console.log('Handling outbox block activity:', activity);
  }
}
