// src/core/controllers/well-known.controller.ts
// Updated to resolve acct:user@domain for WebFinger

import { Controller, Get, Query, HttpCode, HttpStatus, NotFoundException, Header, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from 'src/shared/services/logger.service';
import { ActorService } from 'src/features/activitypub/services/actor.service'; // Import ActorService

@ApiTags('.well-known')
@Controller('.well-known')
export class WellKnownController {
  private readonly instanceBaseUrl: string;
  private readonly instanceHost: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly actorService: ActorService, // Inject ActorService
  ) {
    this.logger.setContext(WellKnownController.name);
    const baseUrl = this.configService.get<string>('INSTANCE_BASE_URL');
    if (!baseUrl) {
      throw new Error('INSTANCE_BASE_URL is not defined in environment variables.');
    }
    this.instanceBaseUrl = baseUrl;
    this.instanceHost = new URL(baseUrl).host; // Extract host from base URL
  }

  /**
   * Implements the WebFinger protocol to resolve a user identifier
   * (e.g., acct:username@domain) into an ActivityPub actor profile URI.
   *
   * @param resource The WebFinger resource identifier (e.g., acct:test@example.com).
   * @returns A JSON Resource Descriptor (JRD) containing links to the actor's profile.
   */
  @Get('webfinger')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/jrd+json') // WebFinger always returns JRD
  @ApiOperation({
    summary: 'WebFinger endpoint for resolving ActivityPub actor profiles',
    description: 'Resolves acct:username@domain to an actor\'s profile URI as per WebFinger RFC7033 and ActivityPub.',
  })
  @ApiQuery({
    name: 'resource',
    description: 'The resource identifier to resolve (e.g., acct:username@domain).',
    example: 'acct:testuser@localhost:3000',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Successful WebFinger lookup. Returns JRD with actor profile link.',
    schema: {
      type: 'object',
      properties: {
        subject: { type: 'string', example: 'acct:testuser@localhost:3000' },
        links: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              rel: { type: 'string', example: 'self' },
              type: { type: 'string', example: 'application/activity+json' },
              href: { type: 'string', example: 'http://localhost:3000/api/actors/testuser' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request: Missing or invalid resource parameter.',
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found: Actor not found for the given resource.',
  })
  async webfinger(@Query('resource') resource: string): Promise<any> {
    this.logger.log(`Received WebFinger request for resource: ${resource}`);

    if (!resource || !resource.startsWith('acct:')) {
      this.logger.warn(`WebFinger: Invalid resource format: ${resource}`);
      throw new BadRequestException('Invalid resource format. Must be acct:username@domain.');
    }

    const parts = resource.substring(5).split('@');
    if (parts.length !== 2) {
      this.logger.warn(`WebFinger: Resource missing username or domain: ${resource}`);
      throw new BadRequestException('Invalid resource format. Must be acct:username@domain.');
    }

    const [preferredUsername, domain] = parts;

    // Validate if the request is for this instance
    if (domain !== this.instanceHost) {
      this.logger.warn(`WebFinger: Request for external domain '${domain}' received. Ignoring.`);
      // For a truly federated server, you might proxy this or redirect.
      // For MVP, we only handle local domains.
      throw new NotFoundException(`Resource for domain '${domain}' not found on this instance.`);
    }

    try {
      // Find the local actor by preferred username
      const actor = await this.actorService.findActorByPreferredUsername(preferredUsername);

      // Construct the JRD response
      const jrd = {
        subject: resource,
        links: [
          {
            rel: 'self',
            type: 'application/activity+json',
            href: actor.activityPubId, // This is the canonical URI for the actor's profile
          },
          // Add other links if necessary, e.g., for profile pages
        ],
      };
      this.logger.log(`WebFinger resolved resource '${resource}' to actor '${actor.activityPubId}'.`);
      return jrd;
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`WebFinger: Actor '${preferredUsername}' not found locally for resource '${resource}'.`);
        throw new NotFoundException(`Actor '${preferredUsername}' not found.`);
      }
      this.logger.error(`WebFinger: Internal server error for resource '${resource}': ${error.message}`, error.stack);
      throw error; // Re-throw other errors
    }
  }

  @Get('nodeinfo')
  @HttpCode(HttpStatus.OK)
  async nodeinfo() {
    return this.configService.get('INSTANCE_BASE_URL');
  }
}
