import { ActorEntity } from "src/features/activitypub/entities/actor.entity";

export const ACTIVITY_HANDLER_TOKEN = 'ACTIVITY_HANDLER_TOKEN';

/**
 * Defines the interface for a service that can handle a specific
 * type of ActivityPub activity.
 */
export interface IActivityHandler {
  readonly type: string;
  handleInbox(activity: any): Promise<void>;
  handleOutbox(activity: any): Promise<void>;
}