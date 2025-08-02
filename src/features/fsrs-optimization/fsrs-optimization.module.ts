// src/features/fsrs-optimization/fsrs-optimization.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { ActorEntity } from 'src/features/activitypub/entities/actor.entity';
import { ReviewLogEntity } from 'src/features/educationpub/entities/review-log.entity';
import { FsrsOptimizationService } from './services/fsrs-optimization.service';
import { FsrsOptimizationProcessor } from './processors/fsrs-optimization.processor';
import { FsrsOptimizationScheduler } from './schedulers/fsrs-optimization.scheduler';
import { CommonModule } from 'src/shared/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ActorEntity, ReviewLogEntity]),
    BullModule.registerQueue({ name: 'fsrs-optimization' }),
    ScheduleModule.forRoot(),
    CommonModule,
  ],
  providers: [
    FsrsOptimizationService,
    FsrsOptimizationProcessor,
    FsrsOptimizationScheduler,
  ],
})
export class FsrsOptimizationModule {}
