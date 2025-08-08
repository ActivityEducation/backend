import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { Node } from '../entities/node.entity';
import { Edge } from '../entities/edge.entity';
import { CreateNodeDto } from '../dto/create-node.dto';
import { CreateEdgeDto } from '../dto/create-edge.dto';
import { InferenceResult } from '../dto/inference-result.dto';
import { FlashcardEntity } from 'src/features/educationpub/entities/flashcard.entity';

@Injectable()
export class KnowledgeGraphService {
  private readonly logger = new Logger(KnowledgeGraphService.name);
  // Define a confidence threshold to filter low-score topics
  private readonly CONFIDENCE_THRESHOLD = 0.60;

  constructor(
    @InjectRepository(Node)
    private readonly nodeRepository: Repository<Node>,
    @InjectRepository(Edge)
    private readonly edgeRepository: Repository<Edge>,
    @InjectRepository(FlashcardEntity)
    private readonly flashcardRepository: Repository<FlashcardEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Takes the output from the zero-shot classification model and persists it to the knowledge graph.
   * This involves creating a node for the input sequence and nodes for high-confidence topics,
   * then creating edges to link them.
   * @param inferenceResult The data returned from the classification model.
   */
  async addInferenceResultToGraph(
    inferenceResult: InferenceResult,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { sequence, labels, scores } = inferenceResult;

      // 1. Find or create the node for the input sequence.
      const sequenceNode = await this.findOrCreateNode(
        queryRunner,
        'Sequence',
        { text: sequence },
      );

      // 2. Iterate through labels and scores, filtering by confidence.
      for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        const score = scores[i];

        if (score < this.CONFIDENCE_THRESHOLD) {
          continue; // Skip topics with scores below the threshold.
        }

        // 3. Find or create a node for the topic.
        const topicNode = await this.findOrCreateNode(queryRunner, 'Topic', {
          name: label,
        });

        // 4. Create an edge linking the sequence to the topic.
        await this.findOrCreateEdge(
          queryRunner,
          sequenceNode.id,
          topicNode.id,
          'has_topic',
          { score },
        );
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Graph updated for sequence: "${sequence}"`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Transaction failed for sequence: "${inferenceResult.sequence}". Rolling back.`,
        error.stack,
      );
      // Re-throw the error to be handled by the calling context if needed.
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
  /**
   * Takes the output from the zero-shot classification model and persists it to the knowledge graph.
   * If a flashcardId is provided, it creates a node for the flashcard and links it to the sequence.
   * @param inferenceResult The data returned from the classification model.
   * @param flashcardId (Optional) The ID of the flashcard being processed.
   */
  async addFlashcardInferenceResultToGraph(
    inferenceResult: InferenceResult,
    flashcardId?: string,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { sequence, labels, scores } = inferenceResult;

      // 1. Find or create the node for the input sequence.
      const sequenceNode = await this.findOrCreateNode(
        queryRunner,
        'Sequence',
        { text: sequence },
      );

      // If a flashcardId is provided, create the flashcard node and link it.
      if (flashcardId) {
        const flashcardNode = await this.findOrCreateNode(
          queryRunner,
          'Flashcard',
          { flashcardId: flashcardId },
        );

        // Create the edge from Flashcard -> Sequence
        await this.findOrCreateEdge(
          queryRunner,
          flashcardNode.id,
          sequenceNode.id,
          'contains_text',
          {},
        );
      }

      // 2. Iterate through labels and scores, filtering by confidence.
      for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        const score = scores[i];

        if (score < this.CONFIDENCE_THRESHOLD) {
          continue; // Skip topics with scores below the threshold.
        }

        // 3. Find or create a node for the topic.
        const topicNode = await this.findOrCreateNode(queryRunner, 'Topic', {
          name: label,
        });

        // 4. Create an edge linking the sequence to the topic.
        await this.findOrCreateEdge(
          queryRunner,
          sequenceNode.id,
          topicNode.id,
          'has_topic',
          { score },
        );
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Graph updated for sequence: "${sequence}"`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Transaction failed for sequence: "${inferenceResult.sequence}". Rolling back.`,
        error.stack,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * A helper method to find an edge or create it if it doesn't exist.
   * Relies on the unique constraint on (sourceId, targetId, type) in the Edge entity.
   * @param queryRunner The active TypeORM QueryRunner.
   * @param sourceId The ID of the source node.
   * @param targetId The ID of the target node.
   * @param type The type of the edge.
   * @param properties The JSONB properties for the edge.
   * @returns The found or newly created Edge entity.
   */
  private async findOrCreateEdge(
    queryRunner: QueryRunner,
    sourceId: string,
    targetId: string,
    type: string,
    properties: Record<string, any>,
  ): Promise<Edge> {
    const existingEdge = await queryRunner.manager.findOne(Edge, {
      where: { sourceId, targetId, type },
    });

    if (existingEdge) {
      // Optionally update properties if the edge already exists
      existingEdge.properties = { ...existingEdge.properties, ...properties };
      return queryRunner.manager.save(existingEdge);
    }

    const newEdge = this.edgeRepository.create({
      sourceId,
      targetId,
      type,
      properties,
    });
    return queryRunner.manager.save(newEdge);
  }

  /**
   * A helper method to find a node by its type and properties, or create it if it doesn't exist.
   * This is crucial for preventing duplicate nodes in the graph.
   * @param queryRunner The active TypeORM QueryRunner.
   * @param type The type of the node (e.g., 'Sequence', 'Topic').
   * @param properties The JSONB properties to match.
   * @returns The found or newly created Node entity.
   */
  private async findOrCreateNode(
    queryRunner: QueryRunner,
    type: string,
    properties: Record<string, any>,
  ): Promise<Node> {
    const existingNode = await queryRunner.manager.findOne(Node, {
      where: { type, properties },
    });

    if (existingNode) {
      return existingNode;
    }

    const newNode = this.nodeRepository.create({ type, properties });
    return queryRunner.manager.save(newNode);
  }

  async createNode(createNodeDto: CreateNodeDto): Promise<Node> {
    const node = this.nodeRepository.create(createNodeDto);
    return this.nodeRepository.save(node);
  }

  async createEdge(createEdgeDto: CreateEdgeDto): Promise<Edge> {
    const { sourceId, targetId, type, properties } = createEdgeDto;

    const sourceNode = await this.findNodeById(sourceId);
    const targetNode = await this.findNodeById(targetId);

    const edge = this.edgeRepository.create({
      source: sourceNode,
      target: targetNode,
      type,
      properties,
    });

    return this.edgeRepository.save(edge);
  }

  async findNodeById(id: string): Promise<Node> {
    const node = await this.nodeRepository.findOneBy({ id });
    if (!node) {
      throw new NotFoundException(`Node with ID "${id}" not found`);
    }
    return node;
  }

  async getGraph(): Promise<{ nodes: Node[]; edges: Edge[] }> {
    const nodes = await this.nodeRepository.find();
    const edges = await this.edgeRepository.find();
    return { nodes, edges };
  }

  async clearGraph() {
    // removes every node and edge from the graph.
    await this.nodeRepository.deleteAll();
    await this.edgeRepository.deleteAll();
  }

  /**
   * Traverses the graph to find all unique nodes connected to a starting node.
   * This is a private helper method using a recursive CTE, which is the most
   * efficient way to handle this in PostgreSQL.
   * @param startNodeId The UUID of the node to start the traversal from.
   * @param maxDepth The maximum number of edges to traverse from the start node.
   * @returns A promise that resolves to an array of Node entities.
   */
  async getConnectedNodes(
    startNodeId: string,
    maxDepth: number,
  ): Promise<Node[]> {
    const rawQuery = `
      WITH RECURSIVE graph_traversal ("targetId", "sourceId", depth, path, cycle) AS (
        -- Anchor Member: Select the direct connections to the starting node
        SELECT
          e."targetId",
          e."sourceId",
          1 AS depth,
          ARRAY[e."sourceId", e."targetId"]::TEXT[] AS path,
          false AS cycle
        FROM kg_edges AS e
        WHERE e."sourceId" = $1
      
        UNION ALL
      
        -- Recursive Member: Find the next level of connections
        SELECT
          e."targetId",
          e."sourceId",
          gt.depth + 1,
          gt.path || e."targetId"::TEXT,
          e."targetId"::TEXT = ANY(gt.path) -- Fix: Cast UUID to TEXT before comparison
        FROM kg_edges AS e
        JOIN graph_traversal AS gt ON e."sourceId" = gt."targetId"
        WHERE NOT gt.cycle AND gt.depth < $2
      )
      -- Final Selection: Retrieve the unique nodes found during traversal
      SELECT DISTINCT n.*
      FROM kg_nodes n
      JOIN (
        SELECT "targetId" AS node_id FROM graph_traversal
        UNION
        SELECT "sourceId" AS node_id FROM graph_traversal
      ) AS traversed_nodes ON n.id = traversed_nodes.node_id;
    `;

    try {
      // The TypeORM query method is the correct way to run this raw SQL.
      // It handles parameter binding ($1, $2) to prevent SQL injection.
      const connectedNodes: Node[] = await this.nodeRepository.query(rawQuery, [
        startNodeId,
        maxDepth,
      ]);
      return connectedNodes;
    } catch (error) {
      console.error(
        'Error executing recursive graph traversal query:',
        error.message,
      );
      // Re-throw a standardized NestJS exception for a clean API response.
      throw new InternalServerErrorException(
        'An error occurred while retrieving connected nodes.',
      );
    }
  }

  /**
   * Finds all flashcards that share at least one topic with a given starting flashcard.
   * This implementation uses a bidirectional recursive CTE to find related nodes.
   *
   * @param startFlashcardId The flashcardId of the starting flashcard.
   * @param depth The maximum traversal depth.
   * @returns A list of objects containing the flashcardId of related flashcards.
   */
  async findRelatedFlashcards(
    startFlashcardId: string,
    depth: number,
  ): Promise<{ flashcardId: string }[]> {
    console.log(
      `[findRelatedFlashcards] Starting search for related flashcards from ID: ${startFlashcardId} with depth: ${depth}`,
    );

    // Step 1: Find the internal Node ID for the starting flashcard.
    // The query has been updated to use the LIKE operator with wildcards for a more robust match,
    // which is resilient to potential data inconsistencies like extra whitespace.
    const startNode = await this.nodeRepository
      .createQueryBuilder('node')
      .where("node.properties->>'flashcardId' LIKE :flashcardId", {
        flashcardId: `%${startFlashcardId}%`,
      })
      .getOne();

    if (!startNode) {
      console.log(
        `[findRelatedFlashcards] No node found for flashcardId: ${startFlashcardId}. Returning empty array.`,
      );
      return [];
    }

    console.log(
      `[findRelatedFlashcards] Found starting node ID: ${startNode.id}`,
    );

    // Step 2: Use a modular helper method to find related flashcards based on shared topics.
    const relatedFlashcards = await this.getRelatedNodesByTopics(startNode.id);

    console.log(
      `[findRelatedFlashcards] Query returned ${relatedFlashcards.length} results.`,
    );
    return relatedFlashcards;
  }

  /**
   * A private helper method to find related flashcard nodes by identifying those
   * that share multiple topics with a given starting node.
   * @param startNodeId The ID of the starting node.
   * @returns A promise that resolves to an array of flashcardId strings.
   */
  private async getRelatedNodesByTopics(
    startNodeId: string,
  ): Promise<{ flashcardId: string }[]> {
    console.log(
      `[getRelatedNodesByTopics] Starting with startNodeId: ${startNodeId}`,
    );

    // First, retrieve the topics for the starting node to log them.
    const startTopicsRaw = await this.nodeRepository.query(
      `
        SELECT t_e."targetId" AS topic_id
        FROM kg_nodes n
        JOIN kg_edges c_e ON n.id = c_e."sourceId"
        JOIN kg_edges t_e ON c_e."targetId" = t_e."sourceId"
        WHERE n.id = $1 AND c_e.type = 'contains_text' AND t_e.type = 'has_topic'
    `,
      [startNodeId],
    );
    console.log(
      `[getRelatedNodesByTopics] Found starting topics:`,
      startTopicsRaw,
    );

    const rawQuery = `
      WITH start_topics AS (
          SELECT
              t_e."targetId" AS topic_id
          FROM kg_nodes n
          JOIN kg_edges c_e ON n.id = c_e."sourceId"
          JOIN kg_edges t_e ON c_e."targetId" = t_e."sourceId"
          WHERE n.id = $1 AND c_e.type = 'contains_text' AND t_e.type = 'has_topic'
      ),
      related_flashcards AS (
        SELECT
            n_rel.properties->>'flashcardId' AS "flashcardId",
            COUNT(e_rel."targetId") AS topic_count
        FROM kg_nodes n_rel
        JOIN kg_edges c_e_rel ON n_rel.id = c_e_rel."sourceId"
        JOIN kg_edges e_rel ON c_e_rel."targetId" = e_rel."sourceId"
        WHERE
            n_rel.type = 'Flashcard' AND
            n_rel.id != $1 AND
            e_rel.type = 'has_topic' AND
            e_rel."targetId" IN (SELECT topic_id FROM start_topics)
        GROUP BY n_rel.id, n_rel.properties->>'flashcardId'
        HAVING COUNT(e_rel."targetId") > 1
      )
      SELECT "flashcardId" FROM related_flashcards
    `;

    try {
      const relatedFlashcards = await this.nodeRepository.query(rawQuery, [
        startNodeId,
      ]);
      console.log(
        `[getRelatedNodesByTopics] Raw query results:`,
        relatedFlashcards,
      );
      return relatedFlashcards;
    } catch (error) {
      console.error(
        'Error executing topic-based related flashcards query:',
        error.message,
      );
      throw new InternalServerErrorException(
        'An error occurred while retrieving related flashcards by topics.',
      );
    }
  }

  /**
   * Takes the output from the NER model and adds People, Places, and Things to the graph.
   * @param sequence The original text that was processed.
   * @param sequenceNodeId The ID of the node for the original text.
   * @param nerResults The results from the NER pipeline.
   */
  async addNerResultsToGraph(
    sequence: string,
    sequenceNodeId: string,
    nerResults: any[],
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const entity of nerResults) {
        // Map NER labels to your desired node types (e.g., PER -> Person)
        const entityTypeMap = {
          'B-PER': 'Person',
          'I-PER': 'Person',
          'I-LOC': 'Location',
          'B-LOC': 'Location',
          "B-ORG": 'Organization',
          "I-ORG": 'Organization',
          MISC: 'Thing', // Or a more specific type if you prefer
        };

        const nodeType = entityTypeMap[entity.entity];
        if (!nodeType) continue; // Skip entities you don't want to store

        if (entity.score < this.CONFIDENCE_THRESHOLD) {
          continue; // Skip topics with scores below the threshold.
        }

        const entityNode = await this.findOrCreateNode(queryRunner, nodeType, {
          name: entity.word,
        });

        await this.findOrCreateEdge(
          queryRunner,
          sequenceNodeId,
          entityNode.id,
          'mentions_entity',
          { score: entity.score },
        );
      }

      await queryRunner.commitTransaction();
      this.logger.log(`NER entities added for sequence: "${sequence}"`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `NER transaction failed for sequence: "${sequence}". Rolling back.`,
        error.stack,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Finds a single node by its type and a set of matching properties using the JSONB contains operator.
   * This is the efficient way to query JSONB columns in PostgreSQL.
   * @param type The type of the node (e.g., 'Sequence', 'Topic').
   * @param properties The JSONB properties to match.
   * @returns The found Node entity or null if not found.
   */
  async findNodeByProperties(
    type: string,
    properties: Record<string, any>,
  ): Promise<Node | null> {
    return this.nodeRepository
      .createQueryBuilder('node')
      .where('node.type = :type', { type })
      .andWhere('node.properties @> :properties', {
        properties: JSON.stringify(properties),
      })
      .getOne();
  }
}
