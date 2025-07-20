import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto'; // Import randomUUID for generating IDs
import { ActivityEntity } from '../entities/activity.entity';
import { ActorEntity } from '../entities/actor.entity';
import { FollowEntity } from '../entities/follow.entity';
import { AppService } from '../../../core/app.service';
import { CustomLogger } from '../../../core/custom-logger.service';

@Processor('outbox') // Designates this class as a BullMQ processor for the 'outbox' queue
export class OutboxProcessor extends WorkerHost {
  constructor(
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: Repository<ActivityEntity>,
    @InjectRepository(ActorEntity)
    private readonly actorRepository: Repository<ActorEntity>,
    @InjectRepository(FollowEntity)
    private readonly followRepository: Repository<FollowEntity>,
    private readonly appService: AppService, // Injects AppService for signing and caching
    private readonly logger: CustomLogger, // Injects custom logger
  ) {
    super();
    this.logger.setContext('OutboxProcessor'); // Sets context for the logger
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case "deliverActivity":
        return this.deliverOutboxActivity(job);
      // No 'processActivity' here, it's handled by InboxProcessor
    }
  }

  /**
   * Delivers an outgoing ActivityPub activity to remote inboxes.
   * This method performs the fan-out of activities, grouping deliveries by domain
   * to leverage shared inboxes where available.
   * @param job The BullMQ job containing the activity ID or the direct activity payload.
   * @throws Error if delivery fails to any recipient, to trigger BullMQ retries.
   */
  async deliverOutboxActivity(job: Job<{ activityId: string; activity?: any }>) {
    const { activityId, activity: directActivityPayload } = job.data;
    this.logger.log(`Starting delivery for outbox activity job: '${job.id}', Activity ID: '${activityId || 'direct payload'}'.`);

    let activity: ActivityEntity;
    let actor: ActorEntity;
    let activityData: any;

    // Determine if we're processing a stored activity or a direct payload
    if (activityId) {
      // Fetch the activity and its associated actor from the database
      activity = await this.activityRepository.findOneOrFail({ where: { id: activityId }, relations: ['actor'] });
      if (!activity || !activity.actor) {
        this.logger.error(`Stored Activity (DB ID: '${activityId}') or its actor not found for delivery. Skipping delivery.`);
        return; // Cannot proceed without activity or actor
      }
      activityData = activity.data;
      actor = activity.actor;
    } else if (directActivityPayload) {
      // If a direct activity payload is provided (e.g., from a relay), use it.
      activityData = directActivityPayload;
      // Fetch the actor based on the actor ID in the payload
      actor = await this.actorRepository.findOneOrFail({ where: { activityPubId: String(directActivityPayload.actor) } });
      if (!actor) {
        this.logger.error(`Actor '${directActivityPayload.actor}' for direct activity payload not found. Skipping delivery.`);
        return;
      }
      // Ensure direct payloads have an ID for logging/tracking purposes if not already present
      if (!activityData.id) activityData.id = `temp-id-${randomUUID()}`;
      this.logger.debug(`Delivering direct activity payload (Type: '${activityData.type}', Actor: '${activityData.actor}').`);
    } else {
      this.logger.error(`No activityId or directActivityPayload provided for job '${job.id}'. Skipping delivery.`);
      return;
    }

    this.logger.debug(`Activity to deliver (ID: '${activityData.id}', Type: '${activityData.type}').`);

    // Map to store unique recipient inboxes (individual or shared) for delivery.
    // Key: target_inbox_url, Value: Set<original_recipient_uris_for_logging>
    const deliveryTargets = new Map<string, Set<string>>();

    // Collect all potential recipient URIs from 'to', 'cc', 'bto', 'bcc', 'audience' fields.
    // The 'audience' field is treated similarly to 'to' and 'cc' for delivery purposes.
    const allRecipientUris = new Set<string>();
    const addRecipient = (uriOrArray: string | string[] | undefined) => {
      if (Array.isArray(uriOrArray)) {
        uriOrArray.filter(Boolean).forEach(uri => allRecipientUris.add(String(uri)));
      } else if (typeof uriOrArray === 'string' && uriOrArray) {
        allRecipientUris.add(String(uriOrArray));
      }
    };

    addRecipient(activityData.to);
    addRecipient(activityData.cc);
    addRecipient(activityData.bto);
    addRecipient(activityData.bcc);
    addRecipient(activityData.audience); // Explicitly add audience field

    // Handle 'Public' audience: expand to all followers of the actor who published the activity.
    if (allRecipientUris.has('https://www.w3.org/ns/activitystreams#Public')) {
      this.logger.log(`Expanding 'Public' audience for activity '${activityData.id}'. Fetching followers of '${actor.activityPubId}'.`);
      // Fetch only accepted followers
      const followers = await this.followRepository.find({ where: { followedActivityPubId: actor.activityPubId, status: 'accepted' } });
      followers.forEach(f => allRecipientUris.add(f.followerActivityPubId));
      allRecipientUris.delete('https://www.w3.org/ns/activitystreams#Public'); // Remove public URI as it's expanded
    }

    // Group recipients by domain to determine whether to use a shared inbox or individual inboxes.
    const domainsToDeliver = new Map<string, Set<string>>(); // Key: domain, Value: Set<actor_activitypub_id>

    for (const recipientUri of allRecipientUris) {
      try {
        const url = new URL(recipientUri);
        const domain = url.hostname;
        // Skip our own domain to prevent self-delivery loops.
        if (domain === new URL(this.appService['instanceBaseUrl']).hostname) {
          this.logger.debug(`Skipping self-delivery for recipient: '${recipientUri}'.`);
          continue;
        }
        if (!domainsToDeliver.has(domain)) {
          domainsToDeliver.set(domain, new Set<string>());
        }
        domainsToDeliver?.get(domain)?.add(recipientUri);
      } catch (e) {
        this.logger.warn(`Invalid recipient URI found: '${recipientUri}'. Skipping this recipient.`);
      }
    }

    // For each unique domain, determine the target inbox URL (shared or individual).
    for (const [domain, actorUrisOnDomain] of domainsToDeliver.entries()) {
      // Use AppService's method for shared inbox discovery and caching
      const sharedInboxUrl = await this.appService.getDomainSharedInbox(domain);
      if (sharedInboxUrl) {
        // If a shared inbox is found for the domain, use it for all actors on this domain.
        if (!deliveryTargets.has(sharedInboxUrl)) {
          deliveryTargets.set(sharedInboxUrl, new Set<string>());
        }
        actorUrisOnDomain.forEach(uri => deliveryTargets?.get(sharedInboxUrl)?.add(uri));
        this.logger.debug(`Using shared inbox '${sharedInboxUrl}' for domain '${domain}' (recipients: ${Array.from(actorUrisOnDomain).join(', ')}).`);
      } else {
        // If no shared inbox, deliver to each individual inbox on that domain.
        for (const actorUri of actorUrisOnDomain) {
          // Use AppService's method for individual inbox discovery and caching
          const individualInboxUrl = await this.appService.getRemoteActorInbox(actorUri);
          if (individualInboxUrl) {
            if (!deliveryTargets.has(individualInboxUrl)) {
              deliveryTargets.set(individualInboxUrl, new Set<string>());
            }
            deliveryTargets?.get(individualInboxUrl)?.add(actorUri);
            this.logger.debug(`Using individual inbox '${individualInboxUrl}' for actor '${actorUri}' on domain '${domain}'.`);
          } else {
            this.logger.warn(`Could not resolve individual inbox for actor '${actorUri}' on domain '${domain}'. Skipping delivery to this actor.`);
          }
        }
      }
    }

    // IMPORTANT SECURITY WARNING:
    // The `actor.privateKeyPem` is used here for signing. In a production environment, this private key
    // should be accessed from a secure Key Management System (KMS) at runtime, not directly
    // from the `ActorEntity` if it's stored in the database or environment variables.
    // This is a critical security vulnerability if private keys are compromised.
    const actorPrivateKeyPem = actor.privateKeyPem;
    if (!actorPrivateKeyPem) {
        this.logger.error(`Private key not found for actor '${actor.activityPubId}'. Cannot sign outgoing activity. Skipping delivery.`);
        // Production Grade Improvement: Implement a robust alert system for missing private keys in production.
        // This is a critical security and operational failure point.
        return; // Cannot proceed without a private key for signing
    }

    const activityBodyString = JSON.stringify(activityData);
    const deliveryPromises: Promise<void>[] = [];

    if (deliveryTargets.size === 0) {
      this.logger.log(`No valid delivery targets found for activity '${activityData.id}'. No deliveries will be attempted.`);
    }

    // Iterate over all determined delivery targets and send the activity.
    for (const [targetInboxUrl, originalRecipientUris] of deliveryTargets.entries()) {
        deliveryPromises.push((async () => {
            this.logger.log(`Attempting to deliver activity '${activityData.id}' to '${targetInboxUrl}' (original recipients: ${Array.from(originalRecipientUris).join(', ')}).`);

            try {
                // Sign the outgoing HTTP request using AppService
                const { date, digest, signatureHeader } = this.appService.signActivity(actor, targetInboxUrl, 'POST', activityBodyString);

                this.logger.debug(`Sending POST request to '${targetInboxUrl}' with signature: ${signatureHeader.substring(0, 100)}...`); // Log truncated signature for brevity

                // Send the POST request with the signed headers
                const response = await fetch(targetInboxUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/activity+json', // Standard ActivityPub content type
                        'Accept': 'application/activity+json, application/ld+json', // Accept ActivityPub JSON-LD
                        'Date': date, // Date header for signature
                        'Digest': digest, // Digest header for body integrity
                        'Signature': signatureHeader, // The HTTP Signature
                    },
                    body: activityBodyString, // The ActivityPub payload
                });

                if (!response.ok) {
                    const errorBody = await response.text();
                    this.logger.error(`Failed to deliver activity '${activityData.id}' to '${targetInboxUrl}'. Remote inbox responded with error: ${response.status} ${response.statusText} - Body: ${errorBody}.`);
                    throw new Error(`Failed to deliver activity to ${targetInboxUrl}`); // Throw error to trigger BullMQ retry
                }

                this.logger.log(`Successfully delivered activity '${activityData.id}' to '${targetInboxUrl}'.`);
            } catch (error) {
                this.logger.error(`Error delivering activity '${activityData.id}' to '${targetInboxUrl}': ${error.message}.`, error.stack);
                throw error; // Re-throw to allow BullMQ to handle retries for transient network issues or remote server errors
            }
        })());
    }

    // Wait for all deliveries to complete or fail. If any promise in the array is rejected,
    // `Promise.allSettled` will still resolve, but we can check the status of each.
    // If any delivery fails, BullMQ will retry the entire job (based on queue configuration).
    const results = await Promise.allSettled(deliveryPromises); 
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        // Log the reason for each failed delivery promise.
        // The overall job will be marked as failed by BullMQ if any promise rejected.
        this.logger.error(`Delivery promise ${index} failed for job '${job.id}': ${result.reason}`);
      }
    });

    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate some work/delay for demonstration purposes
    this.logger.log(`Finished processing delivery job for activity '${activityData.id}'.`);
  }

  // BullMQ Worker Event Handlers: Provide visibility into job lifecycle
  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`BullMQ Job '${job.id}' of type '${job.name}' completed successfully.`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`BullMQ Job '${job.id}' of type '${job.name}' failed with error: ${err.message}. Attempts made: ${job.attemptsMade}.`, err.stack);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.debug(`BullMQ Job '${job.id}' of type '${job.name}' is now active.`);
  }
}
