// src/features/complexity/complexity.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { ActorEntity } from 'src/features/activitypub/entities/actor.entity';
import { ReviewLogEntity } from 'src/features/educationpub/entities/review-log.entity';
import { Node } from 'src/features/knowledge-graph/entities/node.entity';
import { Edge } from 'src/features/knowledge-graph/entities/edge.entity';
import { ComplexityService } from './services/complexity.service';
import { ComplexityProcessor } from './processors/complexity.processor';
import { ComplexityScheduler } from './schedulers/complexity.scheduler';
import { CommonModule } from 'src/shared/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ActorEntity, ReviewLogEntity, Node, Edge]),
    BullModule.registerQueue({
      name: 'complexity',
      defaultJobOptions: {
        // A job will be retried up to 5 times.
        attempts: 5,
        // Use an exponential backoff strategy for retries to avoid overwhelming the system.
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    }),
    ScheduleModule.forRoot(),
    CommonModule,
  ],
  providers: [ComplexityService, ComplexityProcessor, ComplexityScheduler],
})
export class ComplexityModule {}
