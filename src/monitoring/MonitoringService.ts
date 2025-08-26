/**
 * Simple Monitoring Service
 *
 * A straightforward monitoring service that replaces the over-engineered
 * PerformanceManager. No fancy "intelligent" features - just honest monitoring.
 */

import { Cache } from './Cache.js'
import { MemoryMonitor } from './MemoryMonitor.js'
import { Metrics } from './Metrics.js'
import type { MonitoringConfig } from './types.js'
import { DEFAULT_CACHE_SIZE } from './constants.js'

export class MonitoringService {
  private cache: Cache<any>
  private memoryMonitor: MemoryMonitor
  private metrics: Metrics
  private enabled: boolean
  private isStarted = false

  constructor(config?: MonitoringConfig) {
    this.enabled = config?.enabled ?? true
    this.cache = new Cache(config?.cacheSize ?? DEFAULT_CACHE_SIZE)
    this.memoryMonitor = new MemoryMonitor(config?.memoryWarningThreshold)
    this.metrics = new Metrics()
  }

  // Replaces all the complex PerformanceManager methods
  async initialize(): Promise<void> {
    // No complex initialization needed - this is intentionally simple
    return Promise.resolve()
  }

  start(): void {
    if (!this.enabled) return
    this.isStarted = true
    this.metrics.recordOperation('service_start', 0)
  }

  stop(): void {
    if (!this.enabled) return
    this.isStarted = false
    this.metrics.recordOperation('service_stop', 0)
  }

  reset(): void {
    this.cache.clear()
    this.metrics.reset()
  }

  getCache(): Cache<any> {
    return this.cache
  }

  getMetrics() {
    const baseMetrics = this.metrics.getMetrics()
    const memoryInfo = this.memoryMonitor.checkMemory()
    const cacheStats = this.cache.getStats()

    return {
      ...baseMetrics,
      memory: memoryInfo,
      cache: cacheStats,
      enabled: this.enabled,
      started: this.isStarted
    }
  }

  isWithinLimits(): boolean {
    if (!this.enabled) return true

    // Simple memory check - no fancy algorithms
    return !this.memoryMonitor.checkMemory().warning
  }

  // Replaces the complex optimize() method
  async optimize(): Promise<any[]> {
    if (!this.enabled) return []

    // No optimization needed - the old system was fake anyway
    // Just return empty optimizations list for compatibility
    return []
  }

  // Helper methods for backward compatibility
  recordTest(): void {
    if (this.enabled) {
      this.metrics.recordTest()
    }
  }

  recordCacheHit(): void {
    if (this.enabled) {
      this.metrics.recordCacheHit()
    }
  }

  recordCacheMiss(): void {
    if (this.enabled) {
      this.metrics.recordCacheMiss()
    }
  }

  recordError(): void {
    if (this.enabled) {
      this.metrics.recordError()
    }
  }

  timeOperation<T>(name: string, operation: () => T): T {
    if (!this.enabled) {
      return operation()
    }
    return this.metrics.timeOperation(name, operation)
  }

  async timeAsyncOperation<T>(name: string, operation: () => Promise<T>): Promise<T> {
    if (!this.enabled) {
      return await operation()
    }
    return await this.metrics.timeAsyncOperation(name, operation)
  }

  isEnabled(): boolean {
    return this.enabled
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled && this.isStarted) {
      this.stop()
    }
  }
}
