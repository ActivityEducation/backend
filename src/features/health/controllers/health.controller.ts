import { Controller, Get, HttpStatus, HttpCode } from '@nestjs/common';
import { LoggerService } from '../../../shared/services/logger.service';
import {
  DiskHealthIndicator,
  HealthCheckService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
// import { RedisHealthIndicator } from '@nestjs-modules/ioredis';

@Controller('health') // Main controller for handling various API routes
export class HealthController {
  constructor(
    private readonly logger: LoggerService, // Inject custom logger
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    // private readonly redisIndicator: RedisHealthIndicator,
  ) {
    this.logger.setContext('HealthController'); // Set context for the logger for better traceability
  }

  // Health check endpoint: GET /api/health
  // Provides a simple way to check if the application is running and responsive.
  @Get()
  @HttpCode(HttpStatus.OK) // Always return 200 OK if healthy
  async checkHealth() {
    this.logger.debug('Health check requested.');
    return this.health.check([
      () => this.db.pingCheck('database'),
      () =>
        this.disk.checkStorage('storage', { path: '/', thresholdPercent: 0.5 }),
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024),
      // () => this.redisIndicator.isHealthy('redis'),
    ]);
  }
}
