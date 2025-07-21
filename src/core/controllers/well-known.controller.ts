import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppService } from 'src/core/services/app.service';
import { LoggerService } from 'src/shared/services/logger.service';

@ApiTags('Well Known')
@Controller('.well-known')
export class WellKnownController {
  constructor(
    private readonly appService: AppService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('WellKnownController');
  }

  // WebFinger endpoint: GET /.well-known/webfinger
  // Used for discovering actors (users) on this instance.
  @Get('webfinger')
  @Header('Content-Type', 'application/jrd+json') // JRD (JSON Resource Descriptor) content type
  async webfinger(@Query('resource') resource: string) {
    this.logger.debug(`WebFinger request for resource: '${resource}'.`);
    return this.appService.getWebfinger(resource); // Calls the new getWebfinger method in AppService
  }

  // NodeInfo 1.0 well-known endpoint: GET /.well-known/nodeinfo
  @Get('.well-known/nodeinfo')
  @ApiTags('NodeInfo')
  @Header('Content-Type', 'application/json') // NodeInfo is typically JSON
  async nodeinfo() {
    this.logger.debug('NodeInfo 1.0 requested.');
    return this.appService.getNodeInfo1(); // Calls getNodeInfo1
  }
}
