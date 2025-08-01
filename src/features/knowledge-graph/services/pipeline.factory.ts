import {
  pipeline,
  env,
  ProgressCallback,
  Pipeline,
  PipelineType,
} from '@huggingface/transformers';
import { pipeline as xenovaPipeline } from '@xenova/transformers';

env.cacheDir = './.cache/models';

// Define the models you want to use
const models = {
  'zero-shot-classification': 'Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7',
  'token-classification': 'Xenova/bert-base-multilingual-cased-ner-hrl', // A good model for Named Entity Recognition
};

const taskMap = {
  'text-generation': 'text-generation',
  'zero-shot-classification': 'zero-shot-classification',
  'token-classification': 'token-classification',
};

export class PipelineFactory {
  // A map to cache the pipeline instances
  private static instances: Map<keyof typeof models, Promise<Pipeline>> = new Map();

  static async getInstance(
    task: keyof typeof models,
    progress_callback?: ProgressCallback,
  ): Promise<Pipeline> {
    if (!this.instances.has(task)) {
      console.log(`${task} pipeline instance does not exists. Creating...`);
      const model = models[task];
      if (!model) {
        throw new Error(`Invalid task specified: ${task}`);
      }

      const taskType = taskMap[task] as PipelineType ?? task;

      // The pipeline function returns a massive union type that can overwhelm the TS compiler.
      // We cast it to `any` to bypass the complex type inference before assigning it.
      const instance = pipeline(taskType, model, {
        progress_callback,
      }) as any;
      
      this.instances.set(task, instance);
      console.log(`${task} pipeline created for ${taskType}...`);
    }

    // Await the instance promise and use the non-null assertion `!`
    // to assure TypeScript that it won't be null here.
    return await this.instances.get(task)!;
  }
}