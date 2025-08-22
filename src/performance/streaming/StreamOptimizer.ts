/**
 * Stream Optimizer - Adaptive Buffering and Performance
 *
 * Advanced streaming optimization with adaptive buffering,
 * dynamic sizing, and performance-aware stream management.
 *
 * @module StreamOptimizer
 */

import type { IStreamOptimizer, PerformanceMetrics, StreamingOptimizationConfig } from '../types'
import { AdaptiveBuffer } from './AdaptiveBuffer'
import { BackgroundProcessor } from './BackgroundProcessor'
import { PriorityQueue } from './PriorityQueue'
import { coreLogger, errorLogger } from '../../utils/logger'

export class StreamOptimizer implements IStreamOptimizer {
  private config: Required<StreamingOptimizationConfig>
  private adaptiveBuffer: AdaptiveBuffer
  private backgroundProcessor: BackgroundProcessor
  private priorityQueue: PriorityQueue<any>
  private debug = coreLogger()

  constructor(config: StreamingOptimizationConfig) {
    this.config = this.resolveConfig(config)
    this.adaptiveBuffer = new AdaptiveBuffer(this.config.bufferLimits)
    this.backgroundProcessor = new BackgroundProcessor(this.config)
    this.priorityQueue = new PriorityQueue(this.config.priorityQueue)
  }

  private resolveConfig(
    config: StreamingOptimizationConfig
  ): Required<StreamingOptimizationConfig> {
    return {
      enabled: config.enabled ?? true,
      enableAdaptiveBuffering: config.enableAdaptiveBuffering ?? true,
      bufferLimits: {
        min: config.bufferLimits?.min ?? 1024,
        max: config.bufferLimits?.max ?? 1048576,
        initial: config.bufferLimits?.initial ?? 8192
      },
      enableBackgroundProcessing: config.enableBackgroundProcessing ?? true,
      priorityQueue: {
        maxSize: config.priorityQueue?.maxSize ?? 10000,
        batchSize: config.priorityQueue?.batchSize ?? 100,
        processingInterval: config.priorityQueue?.processingInterval ?? 100
      }
    }
  }

  optimizeBuffer(currentSize: number, metrics: PerformanceMetrics): number {
    return this.adaptiveBuffer.optimize(currentSize, metrics)
  }

  async processInBackground<T>(tasks: T[], processor: (task: T) => Promise<void>): Promise<void> {
    return this.backgroundProcessor.process(tasks, processor)
  }

  getOptimalBatchSize(): number {
    return this.priorityQueue.getOptimalBatchSize()
  }

  adjustPriority(taskId: string, priority: number): void {
    this.priorityQueue.adjustPriority(taskId, priority)
  }
}
