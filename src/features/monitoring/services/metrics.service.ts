// src/features/monitoring/services/metrics.service.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as client from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly register = new client.Registry();

  // --- Queue Metrics ---
  private readonly bullQueueSize: client.Gauge;

  // --- Job Metrics ---
  private readonly fsrsJobsProcessedTotal: client.Counter;
  private readonly fsrsJobDurationSeconds: client.Histogram;
  private readonly cdcJobsProcessedTotal: client.Counter;
  private readonly cdcJobDurationSeconds: client.Histogram;
  private readonly jobsFailedTotal: client.Counter;

  constructor(
    @InjectQueue('fsrs-optimization') private readonly fsrsQueue: Queue,
    @InjectQueue('complexity') private readonly complexityQueue: Queue,
  ) {
    // Enable default metrics like CPU and memory usage
    client.collectDefaultMetrics({ register: this.register });

    // --- Gauge for Queue Size ---
    this.bullQueueSize = new client.Gauge({
      name: 'bullmq_queue_size',
      help: 'Number of jobs in a BullMQ queue',
      labelNames: ['queue'],
      registers: [this.register],
    });

    // --- Counters for Processed and Failed Jobs ---
    this.fsrsJobsProcessedTotal = new client.Counter({
      name: 'fsrs_optimization_jobs_processed_total',
      help: 'Total number of FSRS optimization jobs processed',
      registers: [this.register],
    });

    this.cdcJobsProcessedTotal = new client.Counter({
      name: 'cdc_calculation_jobs_processed_total',
      help: 'Total number of CDC calculation jobs processed',
      registers: [this.register],
    });

    this.jobsFailedTotal = new client.Counter({
      name: 'jobs_failed_total',
      help: 'Total number of failed jobs',
      labelNames: ['queue'],
      registers: [this.register],
    });

    // --- Histograms for Job Duration ---
    this.fsrsJobDurationSeconds = new client.Histogram({
      name: 'fsrs_optimization_job_duration_seconds',
      help: 'Duration of FSRS optimization jobs in seconds',
      registers: [this.register],
      buckets: [0.1, 0.5, 1, 5, 10, 30, 60], // Buckets in seconds
    });

    this.cdcJobDurationSeconds = new client.Histogram({
      name: 'cdc_calculation_job_duration_seconds',
      help: 'Duration of CDC calculation jobs in seconds',
      registers: [this.register],
      buckets: [1, 5, 15, 30, 60, 120, 300, 600], // Buckets in seconds
    });
  }

  /**
   * Returns all registered metrics for Prometheus scraping.
   */
  async getMetrics(): Promise<string> {
    // Update queue size gauges before scraping
    const fsrsCounts = await this.fsrsQueue.getJobCounts('wait', 'active', 'delayed');
    this.bullQueueSize.set({ queue: 'fsrs-optimization' }, fsrsCounts.wait + fsrsCounts.active + fsrsCounts.delayed);

    const complexityCounts = await this.complexityQueue.getJobCounts('wait', 'active', 'delayed');
    this.bullQueueSize.set({ queue: 'complexity' }, complexityCounts.wait + complexityCounts.active + complexityCounts.delayed);

    return this.register.metrics();
  }

  // --- Methods to be called by processors ---

  public incrementFsrsJobsProcessed() {
    this.fsrsJobsProcessedTotal.inc();
  }

  public startFsrsJobTimer(): () => void {
    return this.fsrsJobDurationSeconds.startTimer();
  }

  public incrementCdcJobsProcessed() {
    this.cdcJobsProcessedTotal.inc();
  }

  public startCdcJobTimer(): () => void {
    return this.cdcJobDurationSeconds.startTimer();
  }

  public incrementJobsFailed(queueName: 'fsrs-optimization' | 'complexity') {
    this.jobsFailedTotal.inc({ queue: queueName });
  }
}
