/**
 * Memory Profiler - Memory Usage Monitoring
 *
 * Advanced memory profiling system for tracking allocation patterns,
 * memory leaks, and optimization opportunities.
 *
 * @module MemoryProfiler
 */

import type { MemoryMetrics, MemoryConfig } from '../types'
import { coreLogger, errorLogger } from '../../utils/logger'

export interface MemorySnapshot {
  readonly timestamp: number
  readonly heapUsed: number
  readonly heapTotal: number
  readonly external: number
  readonly rss: number
  readonly arrayBuffers: number
}

export interface MemoryTrend {
  readonly trend: 'increasing' | 'decreasing' | 'stable'
  readonly rate: number // bytes per second
  readonly confidence: number // 0-1
}

export class MemoryProfiler {
  private snapshots: MemorySnapshot[] = []
  private config: Required<MemoryConfig>
  private debug = coreLogger()

  constructor(config: Required<MemoryConfig>) {
    this.config = config
  }

  recordSnapshot(metrics: MemoryMetrics): void {
    if (!this.config.enableProfiling) return

    try {
      const memUsage = process.memoryUsage()
      const snapshot: MemorySnapshot = {
        timestamp: Date.now(),
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
        arrayBuffers: memUsage.arrayBuffers || 0
      }

      this.snapshots.push(snapshot)

      // Keep only recent snapshots
      if (this.snapshots.length > 1000) {
        this.snapshots = this.snapshots.slice(-500)
      }
    } catch (error) {
      // Silently handle memory usage errors
      this.debug('Failed to record memory snapshot: %O', error)
    }
  }

  async profile(): Promise<void> {
    if (!this.config.enableProfiling) return

    try {
      // Record current snapshot
      const memUsage = process.memoryUsage()
      this.recordSnapshot({
        currentUsage: memUsage.heapUsed,
        peakUsage: memUsage.heapUsed,
        usagePercentage: 0,
        gcCount: 0,
        pressureLevel: 'low',
        poolStats: { totalPooled: 0, activeObjects: 0, poolHitRatio: 0 }
      })
    } catch (error) {
      // Silently handle memory usage errors
      this.debug('Failed to profile memory: %O', error)
    }
  }

  analyzeTrend(): MemoryTrend {
    if (this.snapshots.length < 10) {
      return { trend: 'stable', rate: 0, confidence: 0 }
    }

    // Simple linear regression on recent snapshots
    const recent = this.snapshots.slice(-50)
    const n = recent.length
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumXX = 0

    recent.forEach((snapshot, i) => {
      sumX += i
      sumY += snapshot.heapUsed
      sumXY += i * snapshot.heapUsed
      sumXX += i * i
    })

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const timeSpan = recent[n - 1].timestamp - recent[0].timestamp
    const rate = slope * (1000 / timeSpan) // bytes per second

    return {
      trend: rate > 1000 ? 'increasing' : rate < -1000 ? 'decreasing' : 'stable',
      rate,
      confidence: Math.min(1, n / 50)
    }
  }

  cleanup(): Promise<number> {
    const cleaned = this.snapshots.length
    this.snapshots = []
    return Promise.resolve(cleaned * 100) // rough estimate
  }
}
