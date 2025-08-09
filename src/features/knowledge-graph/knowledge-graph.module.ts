import { Global, Module } from '@nestjs/common';
import { KnowledgeGraphService } from './services/knowledge-graph.service';
import { KnowledgeGraphController } from './controllers/knowledge-graph.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Edge } from './entities/edge.entity';
import { Node } from './entities/node.entity';
import { InferenceService } from './services/inference.service';
import { BullModule } from '@nestjs/bullmq'; // Import BullModule
import { InferenceProcessor } from './processors/inference.processor';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Node, Edge]),
    // Register a new queue named 'inference'
    BullModule.registerQueue({
      name: 'inference',
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
  ],
  providers: [
    KnowledgeGraphService,
    InferenceService,
    InferenceProcessor, // Add the new queue processor
  ],
  controllers: [KnowledgeGraphController],
  exports: [InferenceService, KnowledgeGraphService],
})
export class KnowledgeGraphModule {}
