// src/features/monitoring/controllers/metrics.controller.ts
import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MetricsService } from '../services/metrics.service';

@ApiTags('Monitoring')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  @ApiOperation({ summary: 'Get application metrics for Prometheus' })
  @ApiResponse({ status: 200, description: 'Prometheus metrics' })
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }
}
