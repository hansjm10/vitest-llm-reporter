/**
 * Adaptive Buffer - Smart Buffering System
 *
 * Intelligent buffer management that adapts size based on
 * performance metrics and throughput patterns.
 *
 * @module AdaptiveBuffer
 */

import type { PerformanceMetrics, StreamingOptimizationConfig } from '../types'

export class AdaptiveBuffer {
  private bufferLimits: Required<StreamingOptimizationConfig>['bufferLimits']
  private currentSize: number
  private performanceHistory: Array<{ size: number; latency: number; throughput: number }> = []

  constructor(bufferLimits: Required<StreamingOptimizationConfig>['bufferLimits']) {
    this.bufferLimits = bufferLimits
    this.currentSize = bufferLimits.initial || 1000
  }

  optimize(currentSize: number, metrics: PerformanceMetrics): number {
    // Record performance data
    this.performanceHistory.push({
      size: currentSize,
      latency: metrics.timing.averageLatency,
      throughput: metrics.throughput.bytesPerSecond
    })

    // Keep only recent history
    if (this.performanceHistory.length > 100) {
      this.performanceHistory = this.performanceHistory.slice(-50)
    }

    // Calculate optimal size based on performance
    const optimalSize = this.calculateOptimalSize(metrics)
    
    // Ensure within limits
    return Math.max(this.bufferLimits.min || 100, Math.min(this.bufferLimits.max || 10000, optimalSize))
  }

  private calculateOptimalSize(metrics: PerformanceMetrics): number {
    // High latency suggests buffer too small
    if (metrics.timing.averageLatency > 100) {
      return Math.min(this.currentSize * 1.5, this.bufferLimits.max || 10000)
    }
    
    // Low throughput with high memory usage suggests buffer too large
    if (metrics.throughput.bytesPerSecond < 1000 && metrics.memory.usagePercentage > 80) {
      return Math.max(this.currentSize * 0.8, this.bufferLimits.min || 100)
    }
    
    return this.currentSize
  }
}