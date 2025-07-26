// src/features/activitypub/services/outbox.processor.ts

import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ActorEntity } from '../entities/actor.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KeyManagementService } from 'src/core/services/key-management.service';
import { RemoteObjectService } from 'src/core/services/remote-object.service';
// import * as HttpSignature from '@peertube/http-signature'; // REMOVED: No longer directly using HttpSignature.sign
import * as jsonld from 'jsonld'; // For JSON-LD canonicalization
import { ConfigService } from '@nestjs/config'; // For instance base URL

/**
 * OutboxProcessor
 *
 * This class serves as a BullMQ processor for the 'outbox' queue. It is responsible
 * for consuming jobs from the outbox queue, signing outgoing ActivityPub activities,
 * and dispatching them to the appropriate remote inboxes.
 *
 * It implements:
 * - HTTP Signature generation for outgoing POST requests.
 * - Discovery of recipient inboxes.
 * - HTTP POST requests to remote inboxes.
 * - Logging of dispatch steps and errors.
 */
@Processor('outbox')
export class OutboxProcessor extends WorkerHost {
  private readonly logger = new Logger(OutboxProcessor.name);
  private readonly instanceBaseUrl: string;

  constructor(
    @InjectRepository(ActorEntity)
    private readonly actorRepository: Repository<ActorEntity>,
    private readonly keyManagementService: KeyManagementService,
    private readonly remoteObjectService: RemoteObjectService,
    private readonly configService: ConfigService,
  ) {
    super();
    const baseUrl = this.configService.get<string>('INSTANCE_BASE_URL');
    if (!baseUrl) {
      throw new Error('INSTANCE_BASE_URL is not defined in environment variables.');
    }
    this.instanceBaseUrl = baseUrl;
  }

  /**
   * Processes a job from the 'outbox' queue.
   * This method is automatically called by BullMQ when a new job is available.
   *
   * @param job The job object containing the activity payload and sender actor ID.
   */
  async process(job: Job<any>): Promise<any> {
    const { activity, actorId } = job.data; // activity is the full JSON-LD payload, actorId is local DB ID
    const activityId = activity.id;
    const activityType = activity.type;

    this.logger.log(
      `Processing outbox job ${job.id} for activity: ${activityId}, Type: ${activityType} from local actor ID: ${actorId}`,
    );

    const senderActor = await this.actorRepository.findOne({ where: { id: actorId } });
    if (!senderActor) {
      this.logger.error(`Sender actor with ID '${actorId}' not found for outbox job '${job.id}'.`);
      throw new Error('Sender actor not found.');
    }

    const privateKeyPem = await this.keyManagementService.getPrivateKey(senderActor.id);
    if (!privateKeyPem) {
      this.logger.error(`Private key not found for actor '${senderActor.activityPubId}'. Cannot sign activity.`);
      throw new Error('Private key not found.');
    }

    // Determine recipients
    const recipients: string[] = [];

    // 'to', 'cc', 'bto', 'bcc', 'audience' fields
    const directRecipients = [
      ...(Array.isArray(activity.to) ? activity.to : [activity.to]),
      ...(Array.isArray(activity.cc) ? activity.cc : [activity.cc]),
      ...(Array.isArray(activity.bto) ? activity.bto : [activity.bto]),
      ...(Array.isArray(activity.bcc) ? activity.bcc : [activity.bcc]),
      ...(Array.isArray(activity.audience) ? activity.audience : [activity.audience]),
    ].filter(Boolean); // Remove null/undefined entries

    // Filter out 'Public' collection URI from direct recipients if not explicitly sending to it
    const publicUri = 'https://www.w3.org/ns/activitystreams#Public';
    const isPublic = directRecipients.includes(publicUri);
    const filteredDirectRecipients = directRecipients.filter(uri => uri !== publicUri);

    // If activity is public, send to followers' inboxes
    if (isPublic) {
      if (senderActor.followersUrl) {
        const followersCollection = await this.remoteObjectService.getActorFollowers(senderActor.followersUrl);
        if (followersCollection && Array.isArray(followersCollection.orderedItems)) {
          followersCollection.orderedItems.forEach(followerUri => {
            if (!recipients.includes(followerUri)) {
              recipients.push(followerUri);
            }
          });
          this.logger.debug(`Activity is public. Added ${followersCollection.orderedItems.length} followers as recipients.`);
        } else {
          this.logger.warn(`Public activity but no followers found or followers collection malformed for actor ${senderActor.activityPubId}.`);
        }
      } else {
        this.logger.warn(`Public activity but senderActor.followersUrl is undefined for actor ${senderActor.activityPubId}. Cannot fetch followers.`);
      }
    }

    // Add direct recipients (excluding 'Public')
    filteredDirectRecipients.forEach(recipient => {
        if (!recipients.includes(recipient)) {
            recipients.push(recipient);
        }
    });

    // If the object of the activity has an 'attributedTo' (e.g., a reply),
    // ensure the attributedTo actor's inbox is also a recipient.
    if (activity.object && typeof activity.object === 'object' && activity.object.attributedTo) {
      const attributedToActorUri = activity.object.attributedTo;
      if (typeof attributedToActorUri === 'string' && attributedToActorUri !== senderActor.activityPubId) {
        recipients.push(attributedToActorUri);
      }
    } else if (typeof activity.object === 'string') {
      // If object is just a URI, try to resolve its attributedTo
      const remoteObject = await this.remoteObjectService.fetchRemoteObject(activity.object).catch(e => {
        this.logger.warn(`Failed to fetch remote object ${activity.object} to find attributedTo for dispatch: ${e.message}`);
        return null;
      });
      if (remoteObject && remoteObject.attributedTo && typeof remoteObject.attributedTo === 'string' && remoteObject.attributedTo !== senderActor.activityPubId) {
        recipients.push(remoteObject.attributedTo);
      }
    }


    if (recipients.length === 0) {
      this.logger.warn(`No recipients found for activity '${activityId}'. Skipping dispatch.`);
      return { status: 'skipped', reason: 'no recipients' };
    }

    // Canonicalize the JSON-LD payload
    let canonicalizedActivity: string;
    try {
      canonicalizedActivity = await jsonld.canonize(activity, { algorithm: 'URDNA2015', format: 'application/n-quads' });
      this.logger.debug(`Canonicalized activity (N-Quads): ${canonicalizedActivity}`);
    } catch (e) {
      this.logger.error(`Failed to canonicalize activity '${activityId}': ${e.message}`, e.stack);
      throw new Error(`Failed to canonicalize activity: ${e.message}`);
    }


    const inboxUrlsToDeliver: Set<string> = new Set();
    for (const recipientUri of recipients) {
      try {
        const actorProfile = await this.remoteObjectService.fetchRemoteObject(recipientUri);
        if (actorProfile && actorProfile.inbox) {
          inboxUrlsToDeliver.add(actorProfile.inbox);
        } else {
          this.logger.warn(`Could not resolve inbox for recipient: ${recipientUri}. Actor profile or inbox URL missing.`);
        }
      } catch (error) {
        this.logger.warn(`Error resolving inbox for ${recipientUri}: ${error.message}`);
      }
    }

    if (inboxUrlsToDeliver.size === 0) {
      this.logger.warn(`No resolvable inboxes for activity '${activityId}'. Skipping dispatch.`);
      return { status: 'skipped', reason: 'no resolvable inboxes' };
    }

    let successCount = 0;
    let failureCount = 0;

    for (const inboxUrl of Array.from(inboxUrlsToDeliver)) {
      try {
        this.logger.log(`Attempting to deliver activity '${activityId}' to inbox: ${inboxUrl}`);

        const date = new Date().toUTCString();
        const activityString = JSON.stringify(activity);
        const digest = this.keyManagementService.generateDigest(activityString);

        // Headers to be included in the request and signed
        // FIX: Ensure header keys are lowercase for consistency with createSigningString's lookup
        const requestHeaders: Record<string, string> = {
          'host': new URL(inboxUrl).host,
          'date': date,
          'content-type': 'application/activity+json',
          'digest': digest,
        };

        // Headers that will form the signing string
        const headersToSign = ['(request-target)', 'host', 'date', 'digest'];

        // Generate the signing string using our custom helper
        const signingString = this.keyManagementService.createSigningString(
          requestHeaders, // Pass the lowercase-keyed headers
          headersToSign,
          'POST', // Method
          inboxUrl, // Full URL for (request-target)
        );

        // Sign the string using Node.js crypto
        const signature = this.keyManagementService.signString(
          signingString,
          privateKeyPem,
          'rsa-sha256', // Algorithm
        );

        // Construct the full Signature header value
        const signatureHeaderValue = `keyId="${senderActor.activityPubId}#main-key",algorithm="rsa-sha256",headers="${headersToSign.join(' ')}",signature="${signature}"`;

        // Add the Signature header to the request headers (can be PascalCase for actual HTTP request)
        requestHeaders['Signature'] = signatureHeaderValue;
        requestHeaders['User-Agent'] = `${this.configService.get<string>('APP_NAME') || 'EduPub'}/${process.env.npm_package_version || '1.0.0'} (+${this.instanceBaseUrl})`;

        this.logger.debug(`Dispatching signed activity to ${inboxUrl} with headers: ${JSON.stringify(requestHeaders)}`);

        const response = await this.remoteObjectService.postSignedActivity(
          senderActor.id, // Internal actor ID
          inboxUrl, // Target inbox URL
          activity, // Activity payload
          requestHeaders // Complete headers including signature
        );

        if (response && response.status >= 200 && response.status < 300) {
          this.logger.log(`Successfully delivered activity '${activityId}' to ${inboxUrl}. Status: ${response.status}`);
          successCount++;
        } else {
          this.logger.error(
            `Failed to deliver activity '${activityId}' to ${inboxUrl}. Status: ${response?.status} ${response?.statusText || 'Unknown Error'}`,
          );
          failureCount++;
        }
      } catch (error) {
        this.logger.error(
          `Exception during delivery of activity '${activityId}' to ${inboxUrl}: ${error.message}`,
          error.stack,
        );
        failureCount++;
      }
    }

    if (failureCount > 0) {
      this.logger.error(
        `Outbox job ${job.id} for activity '${activityId}' completed with ${successCount} successes and ${failureCount} failures.`,
      );
      throw new Error(`Failed to deliver activity to ${failureCount} inboxes.`);
    }

    this.logger.log(`Outbox job ${job.id} for activity '${activityId}' completed successfully.`);
    return { status: 'completed', deliveredTo: successCount };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<any>, error: Error) {
    this.logger.error(
      `Outbox job ${job.id} failed for activity '${job.data.activity.id}': ${error.message}`,
      error.stack,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<any>) {
    this.logger.log(`Outbox job ${job.id} for activity '${job.data.activity.id}' completed.`);
  }
}
