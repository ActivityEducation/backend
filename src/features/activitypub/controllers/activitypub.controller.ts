import {
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AppService } from 'src/core/services/app.service';
import { Activity } from 'src/shared/decorators/activity.decorator';
import { User } from 'src/shared/decorators/user.decorator';
import { HttpSignatureVerificationGuard } from 'src/shared/guards/http-signature-verification.guard';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { RateLimitGuard } from 'src/shared/guards/rate-limit.guard';
import { LoggerService } from 'src/shared/services/logger.service';

@Controller()
export class ActivityPubController {
  constructor(
    private readonly appService: AppService,
    private readonly logger: LoggerService, // Inject custom logger
  ) {
    this.logger.setContext('ActivityPubController');
  }

  // Actor profile endpoint: GET /api/actors/:username
  @Get('actors/:username')
  @Header('Content-Type', 'application/activity+json') // Specify ActivityPub JSON-LD content type
  async getActor(@Param('username') username: string) {
    this.logger.log(`Fetching actor profile for username: '${username}'.`);
    const actorData = await this.appService.getActorProfile(username); // Calls getActorProfile
    return actorData.data; // Return the full ActivityPub profile
  }

  // Actor inbox endpoint: POST /api/actors/:username/inbox
  @Post('actors/:username/inbox')
  @HttpCode(HttpStatus.ACCEPTED) // Return 202 Accepted for asynchronous processing
  @Header('Content-Type', 'application/ld+json') // Specify JSON-LD content type
  @UseGuards(HttpSignatureVerificationGuard, RateLimitGuard) // Apply rate limiting to protect against abuse
  async inbox(@Param('username') username: string, @Activity() activity: any) {
    this.logger.log(
      `Incoming inbox post for '${username}'. Activity Type: '${activity.type || 'N/A'}'.`,
    );

    await this.appService.handleInboxPost(username, activity);
    return { success: true, message: 'Activity received and enqueued.' };
  }

  // Actor outbox endpoint: POST /api/actors/:username/outbox
  @Post('actors/:username/outbox')
  @HttpCode(HttpStatus.ACCEPTED) // Return 202 Accepted for asynchronous processing
  @Header('Content-Type', 'application/ld+json') // Specify JSON-LD content type
  @UseGuards(JwtAuthGuard) // Require JWT authentication for local users posting to outbox
  async outbox(
    @Param('username') username: string,
    @Activity() activity: any,
    @User('id') localActorId: string,
  ) {
    this.logger.log(
      `Incoming outbox post for '${username}' by authenticated user ID: '${localActorId}'. Activity Type: '${activity.type || 'N/A'}'.`,
    );
    await this.appService.handleOutboxPost(username, activity, localActorId);
    return { success: true, message: 'Activity published and enqueued.' };
  }

  // Relay endpoint (conceptual): POST /api/inbox
  @Post('inbox') // Or a more specific relay path like /relay/inbox
  @HttpCode(HttpStatus.ACCEPTED) // Return 202 Accepted for asynchronous processing
  @Header('Content-Type', 'application/ld+json') // Specify JSON-LD content type
  @UseGuards(RateLimitGuard) // Apply rate limiting to protect against abuse
  async relay(@Activity() activity: any, @Req() req: Request) {
    this.logger.log(
      `Incoming relay post. Activity Type: '${activity.type || 'N/A'}'.`,
    );
    await this.appService.handleRelayPost(activity, req);
    return { success: true, message: 'Activity received and enqueued.' };
  }

  // Followers collection endpoint: GET /api/actors/:username/followers
  @Get('actors/:username/followers')
  @Header('Content-Type', 'application/activity+json')
  @UseGuards(RateLimitGuard) // Apply rate limiting to protect against abuse
  async followersCollection(
    @Param('username') username: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(10), ParseIntPipe) perPage: number,
  ) {
    this.logger.log(
      `Fetching followers for '${username}'. Page: ${page}, PerPage: ${perPage}.`,
    );
    return this.appService.getFollowersCollection(username, page, perPage);
  }

  // Following collection endpoint: GET /api/actors/:username/following
  @Get('actors/:username/following')
  @Header('Content-Type', 'application/activity+json')
  @UseGuards(RateLimitGuard) // Apply rate limiting to protect against abuse
  async followingCollection(
    @Param('username') username: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(10), ParseIntPipe) perPage: number,
  ) {
    this.logger.log(
      `Fetching following for '${username}'. Page: ${page}, PerPage: ${perPage}.`,
    );
    return this.appService.getFollowingCollection(username, page, perPage);
  }

  // Outbox collection endpoint: GET /api/actors/:username/outbox
  @Get('actors/:username/outbox')
  @Header('Content-Type', 'application/activity+json')
  @UseGuards(RateLimitGuard) // Apply rate limiting to protect against abuse
  async outboxCollection(
    @Param('username') username: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(10), ParseIntPipe) perPage: number,
    @User('id') authenticatedUserId: string, // Keep for authorization check in service
  ) {
    this.logger.log(
      `Fetching outbox for '${username}'. Page: ${page}, PerPage: ${perPage}.`,
    );
    return this.appService.getOutboxCollection(username, page, perPage);
  }

  // Inbox collection endpoint: GET /api/actors/:username/inbox
  @Get('actors/:username/inbox')
  @Header('Content-Type', 'application/activity+json')
  @UseGuards(JwtAuthGuard) // Protect with JWT for full access, or implement public/private logic in service
  async inboxCollection(
    @Param('username') username: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(10), ParseIntPipe) perPage: number,
    @User('id') authenticatedUserId: string, // Keep for authorization check in service
  ) {
    this.logger.log(
      `Fetching inbox for '${username}'. Page: ${page}, PerPage: ${perPage}.`,
    );
    return this.appService.getInboxCollection(username, page, perPage);
  }

  // Liked collection endpoint: GET /api/actors/:username/liked
  @Get('actors/:username/liked')
  @Header('Content-Type', 'application/activity+json')
  @UseGuards(RateLimitGuard) // Apply rate limiting to protect against abuse
  async likedCollection(
    @Param('username') username: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(10), ParseIntPipe) perPage: number,
  ) {
    this.logger.log(
      `Fetching liked collection for '${username}'. Page: ${page}, PerPage: ${perPage}.`,
    );
    return this.appService.getLikedCollection(username, page, perPage);
  }

  // Content object endpoint: GET /api/objects/:id(*)
  @Get('activities/:id') // Captures the unique ID part of the ActivityPub URI
  @Header('Content-Type', 'application/activity+json') // Standard content type for ActivityPub objects
  @UseGuards(RateLimitGuard) // Apply rate limiting to protect against abuse
  async getActivity(@Param('id') id: string) {
    this.logger.log(`Fetching activity with ID: '${id}'.`);
    // Decode the ID in case it contains URI-encoded characters (though UUIDs usually don't)
    const decodedId = decodeURIComponent(id);

    // Construct the full ActivityPub ID URI to query the database
    // This assumes your API routes are structured such that /api/activities/:id
    // corresponds to a full ActivityPub ID like https://your-domain.com/activities/:id
    const fullActivityPubId = `${this.appService.getInstanceBaseUrl()}/activities/${decodedId}`;

    // Delegate to AppService to find the activity object in the database
    const activityObject =
      await this.appService.getActivityObject(fullActivityPubId);

    if (!activityObject) {
      this.logger.warn(`Activity with ID '${fullActivityPubId}' not found.`);
      throw new NotFoundException(
        `Activity with ID '${fullActivityPubId}' not found.`,
      );
    }
    // Return the 'data' property which holds the full JSON-LD payload
    return activityObject;
  }

  // Content object endpoint: GET /api/objects/:id(*)
  @Get('objects/:id') // Catch-all for ActivityPub object IDs
  @Header('Content-Type', 'application/activity+json')
  @UseGuards(RateLimitGuard) // Apply rate limiting to protect against abuse
  async getObject(@Param('id') id: string) {
    this.logger.log(`Fetching object with ID: '${id}'.`);
    const decodedId = decodeURIComponent(id);
    const contentObject =
      await this.appService.getLocalContentObject(decodedId); // Calls getContentObject
    if (!contentObject) {
      throw new NotFoundException(
        `Content object with ID '${decodedId}' not found.`,
      );
    }
    return contentObject;
  }

  // Public timeline endpoint: GET /api/public
  @Get('public')
  @Header('Content-Type', 'application/activity+json')
  async publicTimeline(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(10), ParseIntPipe) perPage: number,
  ) {
    this.logger.log(
      `Fetching public timeline. Page: ${page}, PerPage: ${perPage}.`,
    );
    return this.appService.getPublicTimeline(page, perPage); // Calls getPublicTimeline
  }
}
