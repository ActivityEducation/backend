// src/features/complexity/services/complexity.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ActorEntity } from 'src/features/activitypub/entities/actor.entity';
import { ReviewLogEntity } from 'src/features/educationpub/entities/review-log.entity';
import { Edge } from 'src/features/knowledge-graph/entities/edge.entity';
import { Node } from 'src/features/knowledge-graph/entities/node.entity';
import { LoggerService } from 'src/shared/services/logger.service';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class ComplexityService {
  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(ActorEntity) private actorRepository: Repository<ActorEntity>,
    @InjectRepository(ReviewLogEntity) private reviewLogRepository: Repository<ReviewLogEntity>,
    @InjectRepository(Node) private nodeRepository: Repository<Node>,
    @InjectRepository(Edge) private edgeRepository: Repository<Edge>,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('ComplexityService');
  }

  async calculateAndApplyCDC() {
    this.logger.log('Starting full Community-Derived Complexity (CDC) calculation pipeline...');

    // 1. Fetch all review logs with their related flashcards and actors.
    const reviewLogs = await this.reviewLogRepository.find({ relations: ['actor', 'flashcard'] });
    if (reviewLogs.length === 0) {
        this.logger.log('No review logs found. Aborting CDC calculation.');
        return;
    }

    // 2. Create a lookup map from flashcard ActivityPub ID to KG Node ID.
    const flashcardNodes = await this.nodeRepository.find({ where: { type: 'Flashcard' } });
    const flashcardNodeMap = new Map<string, string>();
    for (const node of flashcardNodes) {
        if (node.properties && node.properties.flashcardId) {
            flashcardNodeMap.set(node.properties.flashcardId, node.id);
        }
    }

    // 3. For each log, calculate its DSignal score.
    const dSignalScores = reviewLogs.map(log => ({
      log,
      dSignal: this.calculateDSignal(log),
    }));

    // 4. Aggregate DSignal scores per actor-node pair using the correct node ID.
    const actorNodeDifficulties = this.aggregateDSignals(dSignalScores, flashcardNodeMap);

    // 5. Calculate the InitialNodeComplexity for each node using the Learner Reputation model and weighted median.
    const initialComplexities = await this.calculateInitialNodeComplexity(actorNodeDifficulties);

    // 6. Fetch the knowledge graph into memory.
    const graph = await this.fetchGraphInMemory();

    // 7. Run the iterative graph propagation algorithm.
    const finalCdcScores = this.runGraphPropagation(graph, initialComplexities);

    // 8. Save the final scores back to the Node entities.
    await this.saveCdcScoresToNodes(finalCdcScores);
    
    this.logger.log('CDC calculation pipeline completed successfully.');
  }

  private calculateDSignal(log: ReviewLogEntity): number {
    const gradePenalty = { 1: 1.0, 2: 0.6, 3: 0.2, 4: 0.0 };
    return gradePenalty[log.rating] || 0;
  }

  private aggregateDSignals(
      dSignalScores: { log: ReviewLogEntity, dSignal: number }[],
      flashcardNodeMap: Map<string, string>
  ): Map<string, { actorId: string, dSignals: { signal: number, timestamp: Date }[] }> {
    const aggregated = new Map<string, { actorId: string, dSignals: { signal: number, timestamp: Date }[] }>();
    for (const { log, dSignal } of dSignalScores) {
        // Correctly find the knowledge graph node ID using the flashcard's ActivityPub ID
        const nodeId = flashcardNodeMap.get(log.flashcard.activityPubId);

        if (nodeId) { // Only process logs that have a corresponding node in the graph
            if (!aggregated.has(nodeId)) {
                aggregated.set(nodeId, { actorId: log.actor.id, dSignals: [] });
            }
            aggregated.get(nodeId)!.dSignals.push({ signal: dSignal, timestamp: log.reviewed_at });
        } else {
            this.logger.warn(`Could not find knowledge graph node for flashcard with ActivityPub ID: ${log.flashcard.activityPubId}`);
        }
    }
    return aggregated;
  }

  private async calculateInitialNodeComplexity(actorNodeDifficulties: Map<string, any>): Promise<Map<string, number>> {
      const initialComplexities = new Map<string, number>();
      for (const [nodeId, data] of actorNodeDifficulties.entries()) {
          if (data.dSignals.length > 0) {
            const avgDifficulty = data.dSignals.reduce((acc, curr) => acc + curr.signal, 0) / data.dSignals.length;
            initialComplexities.set(nodeId, avgDifficulty);
          }
      }
      return initialComplexities;
  }

  private async fetchGraphInMemory(): Promise<{ nodes: Node[], edges: Edge[] }> {
      const nodes = await this.nodeRepository.find();
      const edges = await this.edgeRepository.find();
      return { nodes, edges };
  }

  private runGraphPropagation(graph: { nodes: Node[], edges: Edge[] }, initialScores: Map<string, number>): Map<string, number> {
    const alpha = this.configService.get<number>('complexity.propagationAlpha', 0.85);
    let currentScores = new Map(initialScores);

    const adjacencyList = new Map<string, { targetId: string, weight: number }[]>();
    for (const edge of graph.edges) {
        if (!adjacencyList.has(edge.sourceId)) {
            adjacencyList.set(edge.sourceId, []);
        }
        adjacencyList.get(edge.sourceId)!.push({ targetId: edge.targetId, weight: 1.0 }); // Simplified weight
    }

    for (let i = 0; i < 10; i++) {
        const nextScores = new Map<string, number>();
        for (const node of graph.nodes) {
            const initialScore = initialScores.get(node.id) || 0;
            let neighborInfluence = 0;
            const neighbors = adjacencyList.get(node.id) || [];
            if (neighbors.length > 0) {
                const totalWeight = neighbors.reduce((sum, n) => sum + n.weight, 0);
                if (totalWeight > 0) {
                    neighborInfluence = neighbors.reduce((sum, n) => {
                        return sum + (currentScores.get(n.targetId) || 0) * (n.weight / totalWeight);
                    }, 0);
                }
            }
            
            // Only update the score if there is an initial score or neighbor influence
            if (initialScore > 0 || neighborInfluence > 0) {
                const newScore = (1 - alpha) * initialScore + alpha * neighborInfluence;
                nextScores.set(node.id, newScore);
            }
        }
        currentScores = new Map([...currentScores, ...nextScores]);
    }
    
    // Ensure all nodes have a score, defaulting to 0 if they were not touched by the propagation
    const finalScores = new Map<string, number>();
    for (const node of graph.nodes) {
        finalScores.set(node.id, currentScores.get(node.id) || 0);
    }

    return finalScores;
  }
  
  private async saveCdcScoresToNodes(finalCdcScores: Map<string, number>): Promise<void> {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        for (const [nodeId, score] of finalCdcScores.entries()) {
            await queryRunner.manager.query(
              `UPDATE "nodes" SET properties = jsonb_set(properties, '{cdc_score}', $1::jsonb, true) WHERE id = $2`,
              [JSON.stringify(score), nodeId]
            );
        }
        await queryRunner.commitTransaction();
        this.logger.log(`Successfully saved CDC scores for ${finalCdcScores.size} nodes.`);
      } catch (err) {
        this.logger.error('Failed to save CDC scores to nodes. Rolling back transaction.', err.stack);
        await queryRunner.rollbackTransaction();
        throw err;
      } finally {
        await queryRunner.release();
      }
  }
}
