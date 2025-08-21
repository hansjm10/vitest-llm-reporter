/**
 * Truncation Metrics Tracker
 * 
 * Centralized tracking of truncation metrics across all pipeline stages.
 * 
 * @module truncation/MetricsTracker
 */

import type { TruncationMetrics } from './TruncationEngine'

/**
 * Truncation stage identifier
 */
export type TruncationStage = 'early' | 'streaming' | 'late' | 'processing'

/**
 * Extended metrics with stage information
 */
export interface StagedTruncationMetrics extends TruncationMetrics {
  /** Pipeline stage where truncation occurred */
  stage: TruncationStage
  /** Timestamp of truncation */
  timestamp: number
  /** Test context if available */
  testContext?: {
    testFile?: string
    testName?: string
    testId?: string
  }
}

/**
 * Aggregated metrics summary
 */
export interface TruncationSummary {
  /** Total number of truncations */
  totalTruncations: number
  /** Truncations by stage */
  byStage: Record<TruncationStage, number>
  /** Total tokens saved */
  tokensSaved: number
  /** Average processing time */
  avgProcessingTime: number
  /** Most active stage */
  mostActiveStage: TruncationStage
}

/**
 * Centralized truncation metrics tracker
 */
export class TruncationMetricsTracker {
  private metrics: StagedTruncationMetrics[] = []
  private enabled: boolean

  constructor(enabled: boolean = true) {
    this.enabled = enabled
  }

  /**
   * Record a truncation event
   */
  recordTruncation(
    metrics: TruncationMetrics,
    stage: TruncationStage,
    testContext?: StagedTruncationMetrics['testContext']
  ): void {
    if (!this.enabled) return

    const stagedMetrics: StagedTruncationMetrics = {
      ...metrics,
      stage,
      timestamp: Date.now(),
      testContext
    }

    this.metrics.push(stagedMetrics)
  }

  /**
   * Get all recorded metrics
   */
  getAllMetrics(): StagedTruncationMetrics[] {
    return [...this.metrics]
  }

  /**
   * Get metrics for a specific stage
   */
  getMetricsByStage(stage: TruncationStage): StagedTruncationMetrics[] {
    return this.metrics.filter(m => m.stage === stage)
  }

  /**
   * Get summary of all truncation activity
   */
  getSummary(): TruncationSummary {
    if (this.metrics.length === 0) {
      return {
        totalTruncations: 0,
        byStage: { early: 0, streaming: 0, late: 0, processing: 0 },
        tokensSaved: 0,
        avgProcessingTime: 0,
        mostActiveStage: 'early'
      }
    }

    const byStage: Record<TruncationStage, number> = {
      early: 0,
      streaming: 0,
      late: 0,
      processing: 0
    }

    let totalTokensSaved = 0
    let totalProcessingTime = 0
    let totalTruncated = 0

    for (const metric of this.metrics) {
      byStage[metric.stage]++
      if (metric.wasTruncated) {
        totalTruncated++
        totalTokensSaved += (metric.originalTokens - metric.truncatedTokens)
      }
      totalProcessingTime += metric.processingTime
    }

    // Find most active stage
    const mostActiveStage = (Object.entries(byStage) as [TruncationStage, number][])
      .reduce((a, b) => a[1] > b[1] ? a : b)[0]

    return {
      totalTruncations: totalTruncated,
      byStage,
      tokensSaved: totalTokensSaved,
      avgProcessingTime: this.metrics.length > 0 ? totalProcessingTime / this.metrics.length : 0,
      mostActiveStage
    }
  }

  /**
   * Get metrics for a specific test
   */
  getTestMetrics(testId: string): StagedTruncationMetrics[] {
    return this.metrics.filter(m => m.testContext?.testId === testId)
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = []
  }

  /**
   * Enable or disable metrics collection
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.clear()
    }
  }

  /**
   * Check if metrics collection is enabled
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Export metrics for analysis
   */
  export(): {
    summary: TruncationSummary
    details: StagedTruncationMetrics[]
    exportTime: number
  } {
    return {
      summary: this.getSummary(),
      details: this.getAllMetrics(),
      exportTime: Date.now()
    }
  }
}

/**
 * Global metrics tracker instance
 */
export const globalTruncationMetrics = new TruncationMetricsTracker(false) // Disabled by default