/**
 * Simple Metrics Collector
 *
 * Basic metrics collection without any fancy algorithms.
 * Just counts and timers - nothing "intelligent" about it.
 */

import { MAX_TRACKED_OPERATIONS } from './constants.js'
import { coreLogger } from '../utils/logger.js'

export class Metrics {
  private startTime = Date.now()
  private testCount = 0
  private cacheHits = 0
  private cacheMisses = 0
  private errorCount = 0
  private operations: Array<{ name: string; duration: number; timestamp: number }> = []
  private debug = coreLogger()

  recordTest(): void {
    this.testCount++
  }

  recordCacheHit(): void {
    this.cacheHits++
  }

  recordCacheMiss(): void {
    this.cacheMisses++
  }

  recordError(): void {
    this.errorCount++
  }

  recordOperation(name: string, duration: number): void {
    this.operations.push({
      name,
      duration,
      timestamp: Date.now()
    })

    // Log timing under DEBUG
    this.debug(`[TIMING] ${name}: ${duration}ms`)

    // Keep only last operations to avoid memory bloat
    if (this.operations.length > MAX_TRACKED_OPERATIONS) {
      this.operations.shift()
    }
  }

  timeOperation<T>(name: string, operation: () => T): T {
    const start = Date.now()
    try {
      const result = operation()
      const duration = Date.now() - start
      this.recordOperation(name, duration)
      return result
    } catch (error) {
      const duration = Date.now() - start
      this.recordOperation(name, duration)
      this.recordError()
      throw error
    }
  }

  async timeAsyncOperation<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const start = Date.now()
    try {
      const result = await operation()
      const duration = Date.now() - start
      this.recordOperation(name, duration)
      return result
    } catch (error) {
      const duration = Date.now() - start
      this.recordOperation(name, duration)
      this.recordError()
      throw error
    }
  }

  getMetrics(): {
    duration: number
    testCount: number
    errorCount: number
    cacheHitRate: number
    cacheHits: number
    cacheMisses: number
    memoryUsed: number
    operationCount: number
    averageOperationTime: number
    uptime: number
  } {
    const now = Date.now()
    const memoryUsed =
      typeof process?.memoryUsage === 'function' ? process.memoryUsage().heapUsed : 0

    const totalCacheOps = this.cacheHits + this.cacheMisses
    const avgOperationTime =
      this.operations.length > 0
        ? this.operations.reduce((sum, op) => sum + op.duration, 0) / this.operations.length
        : 0

    return {
      duration: now - this.startTime,
      testCount: this.testCount,
      errorCount: this.errorCount,
      cacheHitRate: totalCacheOps > 0 ? this.cacheHits / totalCacheOps : 0,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      memoryUsed,
      operationCount: this.operations.length,
      averageOperationTime: avgOperationTime,
      uptime: now - this.startTime
    }
  }

  getRecentOperations(limit = 10): Array<{ name: string; duration: number; timestamp: number }> {
    return this.operations.slice(-limit)
  }

  reset(): void {
    this.startTime = Date.now()
    this.testCount = 0
    this.cacheHits = 0
    this.cacheMisses = 0
    this.errorCount = 0
    this.operations = []
  }
}
