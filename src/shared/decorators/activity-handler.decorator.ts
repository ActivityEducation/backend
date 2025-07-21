// src/activity-handlers/decorators/activity-handler.decorator.ts
import { Injectable } from '@nestjs/common';
import 'reflect-metadata'; // Ensure reflect-metadata is imported for metadata operations

/**
 * Metadata key for storing the activity type associated with a handler.
 */
export const ACTIVITY_HANDLER_METADATA = 'activity:handler:type';

/**
 * A decorator that marks a class as an ActivityPub activity handler.
 * It also makes the class injectable by the NestJS DI container.
 *
 * @param type The ActivityPub 'type' string (e.g., 'Follow', 'Create') that this handler processes.
 */
export function ActivityHandler(type: string): ClassDecorator {
  return (target: Function) => {
    // Apply the @Injectable() decorator to ensure the class can be injected
    Injectable()(target);

    // Define metadata on the class to store the activity type
    Reflect.defineMetadata(ACTIVITY_HANDLER_METADATA, type, target);
  };
}