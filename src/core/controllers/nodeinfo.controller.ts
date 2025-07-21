import { Controller, Get, Header } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AppService } from "src/core/services/app.service";
import { LoggerService } from "src/shared/services/logger.service";

@ApiTags('NodeInfo')
@Controller('nodeinfo')
export class NodeInfoController {
  constructor(
    private readonly appService: AppService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('NodeInfoController');
  }

  // NodeInfo 2.0 endpoint: GET /nodeinfo/2.0
  @Get('nodeinfo/2.0')
  @Header('Content-Type', 'application/json') // NodeInfo is typically JSON
  async nodeinfo2() {
    this.logger.debug('NodeInfo 2.0 requested.');
    return this.appService.getNodeInfo2();
  }
}