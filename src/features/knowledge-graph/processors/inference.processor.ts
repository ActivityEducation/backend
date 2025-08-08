import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { KnowledgeGraphService } from '../services/knowledge-graph.service';
import { Logger, OnModuleInit } from '@nestjs/common';
import { FlashcardEntity } from 'src/features/educationpub/entities/flashcard.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ZeroShotClassificationPipeline,
  TokenClassificationPipeline,
  ZeroShotClassificationOutput,
  TextGenerationPipeline,
} from '@huggingface/transformers';
import { InferenceResult } from '../dto/inference-result.dto';
import { PipelineFactory } from '../services/pipeline.factory';

// Helper function and topics array remain the same
function generateFlashcardTextStream(flashcard: FlashcardEntity): string {
    const eduModel = flashcard.eduModel;
    const fieldsData = flashcard.eduFieldsData as Record<string, any>;
    const outputParts: string[] = [];

    if (!eduModel || !Array.isArray(eduModel.fields) || !fieldsData) {
        return '';
    }

    for (const field of eduModel.fields) {
        const isTextField = field.type === 'text';
        // FIX: Use the field's 'id' to look up the corresponding value in fieldsData,
        // as the 'id' is the key in the data object.
        const value = fieldsData[field.id];

        if (isTextField && typeof value === 'string' && value.trim() !== '') {
            outputParts.push(value.trim());
        }
    }
    return outputParts.join('; ');
}

const topics = [ "Arts & Humanities", "Society & Social Sciences", "Business & Finance", "Science & Mathematics", "Technology & Engineering", "Medicine & Health", "Geography & Places", "People & Self", "Philosophy & Religion", "Culture & Entertainment", "Language & Linguistics", "General Reference & Knowledge"];
interface InferenceJobData {
  flashcardId: string;
}


@Processor('inference', { concurrency: 1 })
export class InferenceProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(InferenceProcessor.name);
  
  // Properties to hold the initialized pipelines
  private classifier: ZeroShotClassificationPipeline;
  private ner: TokenClassificationPipeline;

  constructor(
    private readonly knowledgeGraphService: KnowledgeGraphService,
    @InjectRepository(FlashcardEntity)
    private readonly flashcardRepository: Repository<FlashcardEntity>,
  ) {
    super();
  }

  /**
   * This NestJS lifecycle hook is called once the module has been initialized.
   * We use it to pre-load the AI models so the processor is "warm" and
   * ready to handle jobs immediately.
   */
  async onModuleInit() {
    this.logger.log('Warming up pipelines...');
    try {
      // Load all necessary models in parallel
      [this.classifier, this.ner] = await Promise.all([
        PipelineFactory.getInstance('zero-shot-classification') as unknown as ZeroShotClassificationPipeline,
        PipelineFactory.getInstance('token-classification') as unknown as TokenClassificationPipeline,
      ]);
      this.logger.log('Pipelines are ready to process jobs.');
    } catch (error) {
      this.logger.error('Failed to initialize pipelines.', error);
    }
  }

  async process(job: Job<InferenceJobData>): Promise<void> {
    this.logger.log(`Processing inference job ${job.id} for flashcard ID: ${job.data.flashcardId}`);

    // Check if pipelines are initialized
    if (!this.classifier || !this.ner) {
        this.logger.error('Pipelines are not initialized. Skipping job.');
        throw new Error('Pipelines not ready');
    }

    const flashcard = await this.flashcardRepository.findOne({
      where: { id: job.data.flashcardId },
      relations: ['eduModel'],
    });

    if (!flashcard) {
      this.logger.error(`Flashcard with ID ${job.data.flashcardId} not found. Skipping job.`);
      return;
    }

    const text = generateFlashcardTextStream(flashcard);
    if (!text) {
      this.logger.log(`Flashcard ${flashcard.id} has no text content. Skipping.`);
      return;
    }

    try {
      // Use the pre-loaded pipelines
      const [classificationResult, nerResult] = await Promise.all([
        this.classifier(text, topics),
        this.ner(text, { group_entities: true } as any),
      ]);

      const inferenceResultForGraph: InferenceResult = {
        sequence: (classificationResult as ZeroShotClassificationOutput).sequence,
        labels: (classificationResult as ZeroShotClassificationOutput).labels,
        scores: (classificationResult as ZeroShotClassificationOutput).scores,
      };

      await this.knowledgeGraphService.addFlashcardInferenceResultToGraph(
        inferenceResultForGraph,
        flashcard.activityPubId,
      );
      
      const sequenceNode = await this.knowledgeGraphService.findNodeByProperties('Sequence', { text });
      if (sequenceNode) {
        await this.knowledgeGraphService.addNerResultsToGraph(
          text,
          sequenceNode.id,
          nerResult as any[],
        );
      }

      this.logger.log(`Successfully completed inference job for flashcard ID: ${flashcard.id}`);
    } catch (error) {
      this.logger.error(`Inference job for flashcard ${flashcard.id} failed`, error.stack);
      throw error;
    }
  }
}