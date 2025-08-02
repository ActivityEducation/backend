// src/features/monitoring/monitoring.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MetricsController } from './controllers/metrics.controller';
import { MetricsService } from './services/metrics.service';
import { CommonModule } from 'src/shared/common.module';

@Module({
  imports: [
    CommonModule,
    // Import BullModule and register the queues that MetricsService depends on.
    BullModule.registerQueue(
      { name: 'fsrs-optimization' },
      { name: 'complexity' },
    ),
  ],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MonitoringModule {}
