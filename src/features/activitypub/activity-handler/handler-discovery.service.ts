import { Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, ModuleRef } from '@nestjs/core';
import { ACTIVITY_HANDLER_METADATA } from 'src/shared/decorators/activity-handler.decorator';
import { IActivityHandler } from './interfaces/activity-handler.interface';
import { LoggerService } from 'src/shared/services/logger.service';

@Injectable()
export class HandlerDiscoveryService implements OnModuleInit {
  private readonly activityHandlers = new Map<string, IActivityHandler>();

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('HandlerDiscoveryService');
  }

  async onModuleInit() {
    this.logger.log('Discovering and registering Activity Handlers...');
    
    // Get all providers (classes) registered in the NestJS application context
    const providers = this.discoveryService.getProviders();

    for (const wrapper of providers) {
      const { instance, metatype } = wrapper;

      // Ensure we have an instance and its metadata type
      if (instance && metatype && typeof metatype === 'function') {
        // Check if the class has our custom metadata
        const activityType = Reflect.getMetadata(ACTIVITY_HANDLER_METADATA, metatype);

        if (activityType && typeof activityType === 'string') {
          // Validate that the discovered instance actually implements IActivityHandler
          if ('handleInbox' in instance && typeof instance.handleInbox === 'function' && 'type' in instance) {
            this.activityHandlers.set(activityType, instance as IActivityHandler);
            this.logger.log(`Registered '${activityType}' activity handler: ${metatype.name}.`);
          } else {
            this.logger.warn(`Class '${metatype.name}' is decorated with @ActivityHandler('${activityType}') but does not implement IActivityHandler correctly.`);
          }
        }
      }
    }
    this.logger.log(`Finished discovering and registering ${this.activityHandlers.size} activity handlers.`);
  }

  /**
   * Retrieves the appropriate activity handler for a given ActivityPub type.
   * @param activityType The 'type' field of the ActivityPub activity.
   * @returns The IActivityHandler instance, or undefined if no handler is found for the type.
   */
  getHandler(activityType: string): IActivityHandler | undefined {
    return this.activityHandlers.get(activityType);
  }
}