import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Header,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AppService } from './core/app.service';
import { Request } from 'express';
import { CustomLogger } from './core/custom-logger.service';
import { HttpSignatureVerificationGuard } from './shared/guards/http-signature-verification.guard';
import { RateLimitGuard } from './shared/guards/rate-limit.guard';
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';
import { Activity } from './shared/decorators/activity.decorator';
import { User } from './shared/decorators/user.decorator';

@Controller() // Main controller for handling various API routes
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly logger: CustomLogger, // Inject custom logger
  ) {
    this.logger.setContext('AppController'); // Set context for the logger for better traceability
  }

  // Health check endpoint: GET /api/health
  // Provides a simple way to check if the application is running and responsive.
  @Get('health')
  @HttpCode(HttpStatus.OK) // Always return 200 OK if healthy
  async health() {
    this.logger.debug('Health check requested.');
    return this.appService.getHealthStatus();
  }

  // WebFinger endpoint: GET /.well-known/webfinger
  // Used for discovering actors (users) on this instance.
  @Get('.well-known/webfinger')
  @Header('Content-Type', 'application/jrd+json') // JRD (JSON Resource Descriptor) content type
  async webfinger(@Query('resource') resource: string) {
    this.logger.debug(`WebFinger request for resource: '${resource}'.`);
    return this.appService.getWebfinger(resource); // Calls the new getWebfinger method in AppService
  }

  // NodeInfo 2.0 endpoint: GET /nodeinfo/2.0
  @Get('nodeinfo/2.0')
  @Header('Content-Type', 'application/json') // NodeInfo is typically JSON
  async nodeinfo2() {
    this.logger.debug('NodeInfo 2.0 requested.');
    return this.appService.getNodeInfo2();
  }

  // NodeInfo 1.0 well-known endpoint: GET /.well-known/nodeinfo
  @Get('.well-known/nodeinfo')
  @Header('Content-Type', 'application/json') // NodeInfo is typically JSON
  async nodeinfo() {
    this.logger.debug('NodeInfo 1.0 requested.');
    return this.appService.getNodeInfo1(); // Calls getNodeInfo1
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
  @UseGuards(HttpSignatureVerificationGuard, RateLimitGuard) // Apply rate limiting to protect against abuse
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
  @UseGuards(JwtAuthGuard) // Protect with JWT for full access, or implement public/private logic in service
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
  @Get('objects/:id/*path') // Catch-all for ActivityPub object IDs
  @Header('Content-Type', 'application/activity+json')
  async getObject(@Param('id') id: string) {
    this.logger.log(`Fetching object with ID: '${id}'.`);
    const decodedId = decodeURIComponent(id);
    const contentObject = await this.appService.getContentObject(decodedId); // Calls getContentObject
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
