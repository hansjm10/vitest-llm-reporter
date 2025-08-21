/**
 * Metrics Collector - Performance Data Aggregation
 *
 * Collects and aggregates performance metrics from various subsystems
 * including timing, memory, cache, and throughput metrics.
 *
 * @module MetricsCollector
 */

import type {
  PerformanceMetrics,
  TimingMetrics,
  MemoryMetrics,
  CacheMetrics,
  ThroughputMetrics,
  OverheadMetrics,
  MemoryPressureLevel,
  CacheInstanceMetrics,
  IMetricsCollector,
  PerformanceConfig
} from './types'
import { coreLogger, errorLogger } from '../utils/logger'

/**
 * Performance data point for tracking metrics over time
 */
interface MetricsDataPoint extends PerformanceMetrics {
  readonly id: string
}

/**
 * Timing measurement context
 */
interface TimingContext {
  readonly id: string
  readonly startTime: number
  readonly operation: string
}

/**
 * Memory usage snapshot
 */
interface MemorySnapshot {
  readonly timestamp: number
  readonly usage: number
  readonly heapUsed: number
  readonly heapTotal: number
  readonly external: number
}

/**
 * Cache operation tracking
 */
interface CacheOperation {
  readonly timestamp: number
  readonly operation: 'hit' | 'miss' | 'set' | 'evict'
  readonly cache: string
  readonly duration: number
}

/**
 * Metrics collector implementation
 */
export class MetricsCollector implements IMetricsCollector {
  private config: Required<PerformanceConfig>
  private isCollecting = false
  private metricsHistory: MetricsDataPoint[] = []
  private timingContexts = new Map<string, TimingContext>()
  private memorySnapshots: MemorySnapshot[] = []
  private cacheOperations: CacheOperation[] = []
  private throughputCounters = {
    testsProcessed: 0,
    operationsExecuted: 0,
    bytesProcessed: 0,
    cacheOperations: 0,
    startTime: Date.now()
  }
  private overheadTracker = {
    performanceTime: 0,
    streamingTime: 0,
    cacheTime: 0,
    memoryTime: 0,
    totalTime: 0,
    baselineTime: 0
  }
  private debug = coreLogger()
  private debugError = errorLogger()

  constructor(config: Required<PerformanceConfig>) {
    this.config = config
  }

  /**
   * Start collecting metrics
   */
  start(): void {
    if (this.isCollecting) {
      return
    }

    this.isCollecting = true
    this.throughputCounters.startTime = Date.now()
    this.debug('Metrics collection started')

    // Start periodic memory monitoring if enabled
    if (this.config.memory.enabled) {
      this.startMemoryMonitoring()
    }
  }

  /**
   * Stop collecting metrics
   */
  stop(): void {
    if (!this.isCollecting) {
      return
    }

    this.isCollecting = false
    this.debug('Metrics collection stopped')
  }

  /**
   * Collect current performance metrics
   */
  collect(): PerformanceMetrics {
    const timestamp = Date.now()

    try {
      const metrics: PerformanceMetrics = {
        timing: this.collectTimingMetrics(),
        memory: this.collectMemoryMetrics(),
        cache: this.collectCacheMetrics(),
        throughput: this.collectThroughputMetrics(),
        overhead: this.collectOverheadMetrics(),
        timestamp
      }

      // Add to history if collecting
      if (this.isCollecting) {
        const dataPoint: MetricsDataPoint = {
          ...metrics,
          id: `metrics_${timestamp}_${Math.random().toString(36).substr(2, 9)}`
        }
        
        this.metricsHistory.push(dataPoint)
        
        // Limit history size to prevent memory leaks
        if (this.metricsHistory.length > 1000) {
          this.metricsHistory = this.metricsHistory.slice(-500)
        }
      }

      return metrics
    } catch (error) {
      this.debugError('Failed to collect metrics: %O', error)
      return this.createEmptyMetrics(timestamp)
    }
  }

  /**
   * Get metrics history
   */
  getHistory(): PerformanceMetrics[] {
    return this.metricsHistory.map(({ id, ...metrics }) => metrics)
  }

  /**
   * Clear metrics history
   */
  clearHistory(): void {
    this.metricsHistory = []
    this.memorySnapshots = []
    this.cacheOperations = []
    this.timingContexts.clear()
    this.resetCounters()
    this.debug('Metrics history cleared')
  }

  /**
   * Record timing operation start
   */
  startTiming(operation: string): string {
    const id = `timing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const context: TimingContext = {
      id,
      startTime: Date.now(),
      operation
    }
    
    this.timingContexts.set(id, context)
    return id
  }

  /**
   * Record timing operation end
   */
  endTiming(timingId: string): number {
    const context = this.timingContexts.get(timingId)
    if (!context) {
      this.debugError('Timing context not found: %s', timingId)
      return 0
    }

    const duration = Date.now() - context.startTime
    this.timingContexts.delete(timingId)
    
    // Update overhead tracking based on operation type
    this.updateOverheadTracking(context.operation, duration)
    
    return duration
  }

  /**
   * Record cache operation
   */
  recordCacheOperation(cache: string, operation: 'hit' | 'miss' | 'set' | 'evict', duration: number): void {
    const cacheOp: CacheOperation = {
      timestamp: Date.now(),
      operation,
      cache,
      duration
    }
    
    this.cacheOperations.push(cacheOp)
    this.throughputCounters.cacheOperations++
    
    // Limit cache operations history
    if (this.cacheOperations.length > 10000) {
      this.cacheOperations = this.cacheOperations.slice(-5000)
    }
  }

  /**
   * Record test processing
   */
  recordTestProcessed(bytesProcessed = 0): void {
    this.throughputCounters.testsProcessed++
    this.throughputCounters.bytesProcessed += bytesProcessed
    this.throughputCounters.operationsExecuted++
  }

  /**
   * Record operation execution
   */
  recordOperation(bytesProcessed = 0): void {
    this.throughputCounters.operationsExecuted++
    this.throughputCounters.bytesProcessed += bytesProcessed
  }

  /**
   * Collect timing metrics
   */
  private collectTimingMetrics(): TimingMetrics {
    // Calculate metrics from recent timing data
    const recentWindow = Date.now() - 60000 // Last minute
    const recentOperations = this.cacheOperations.filter(op => op.timestamp > recentWindow)
    
    let totalTime = 0
    let cacheLookupTime = 0
    const latencies: number[] = []

    recentOperations.forEach(op => {
      totalTime += op.duration
      if (op.operation === 'hit' || op.operation === 'miss') {
        cacheLookupTime += op.duration
      }
      latencies.push(op.duration)
    })

    // Sort latencies for percentile calculations
    latencies.sort((a, b) => a - b)
    
    const p95Index = Math.floor(latencies.length * 0.95)
    const p99Index = Math.floor(latencies.length * 0.99)

    return {
      totalTime: this.overheadTracker.totalTime,
      testProcessingTime: this.overheadTracker.baselineTime,
      outputGenerationTime: this.overheadTracker.totalTime - this.overheadTracker.baselineTime,
      cacheLookupTime,
      averageLatency: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      p95Latency: latencies[p95Index] || 0,
      p99Latency: latencies[p99Index] || 0
    }
  }

  /**
   * Collect memory metrics
   */
  private collectMemoryMetrics(): MemoryMetrics {
    try {
      const memUsage = process.memoryUsage()
      const currentUsage = memUsage.heapUsed
      
      // Take memory snapshot
      const snapshot: MemorySnapshot = {
        timestamp: Date.now(),
        usage: currentUsage,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external
      }
      
      this.memorySnapshots.push(snapshot)
      
      // Calculate peak usage from recent snapshots
      const recentSnapshots = this.memorySnapshots.slice(-100) // Keep last 100 snapshots
      const peakUsage = Math.max(...recentSnapshots.map(s => s.usage))
      
      // Estimate memory pressure
      const usagePercentage = (currentUsage / memUsage.heapTotal) * 100
      const pressureLevel = this.calculateMemoryPressure(usagePercentage)
      
      // Estimate GC count (simplified)
      const gcCount = Math.floor(peakUsage / (50 * 1024 * 1024)) // Rough estimate
      
      return {
        currentUsage,
        peakUsage,
        usagePercentage,
        gcCount,
        pressureLevel,
        poolStats: {
          totalPooled: 0, // Would be provided by MemoryManager
          activeObjects: 0,
          poolHitRatio: 0
        }
      }
    } catch (error) {
      this.debugError('Failed to collect memory metrics: %O', error)
      return this.createEmptyMemoryMetrics()
    }
  }

  /**
   * Collect cache metrics
   */
  private collectCacheMetrics(): CacheMetrics {
    const recentWindow = Date.now() - 300000 // Last 5 minutes
    const recentOps = this.cacheOperations.filter(op => op.timestamp > recentWindow)
    
    // Aggregate by cache type
    const cacheStats = new Map<string, { hits: number; misses: number; operations: number; totalTime: number }>()
    
    recentOps.forEach(op => {
      if (!cacheStats.has(op.cache)) {
        cacheStats.set(op.cache, { hits: 0, misses: 0, operations: 0, totalTime: 0 })
      }
      
      const stats = cacheStats.get(op.cache)!
      stats.operations++
      stats.totalTime += op.duration
      
      if (op.operation === 'hit') {
        stats.hits++
      } else if (op.operation === 'miss') {
        stats.misses++
      }
    })
    
    // Calculate overall metrics
    let totalHits = 0
    let totalMisses = 0
    let totalOps = 0
    
    cacheStats.forEach(stats => {
      totalHits += stats.hits
      totalMisses += stats.misses
      totalOps += stats.operations
    })
    
    const hitRatio = totalOps > 0 ? (totalHits / (totalHits + totalMisses)) * 100 : 0
    const efficiency = Math.min(hitRatio / 80 * 100, 100) // Target 80% hit ratio
    
    // Create individual cache metrics
    const createCacheInstanceMetrics = (cacheName: string): CacheInstanceMetrics => {
      const stats = cacheStats.get(cacheName)
      if (!stats) {
        return {
          hitRatio: 0,
          size: 0,
          capacity: 0,
          evictions: 0,
          averageLookupTime: 0
        }
      }
      
      const cacheHitRatio = stats.hits + stats.misses > 0 ? 
        (stats.hits / (stats.hits + stats.misses)) * 100 : 0
      
      return {
        hitRatio: cacheHitRatio,
        size: stats.operations, // Approximation
        capacity: this.getCacheCapacity(cacheName),
        evictions: 0, // Would need to track separately
        averageLookupTime: stats.operations > 0 ? stats.totalTime / stats.operations : 0
      }
    }
    
    return {
      hitRatio,
      hits: totalHits,
      misses: totalMisses,
      size: totalOps,
      capacity: this.config.cache!.tokenCacheSize! + this.config.cache!.resultCacheSize! + this.config.cache!.templateCacheSize!,
      efficiency,
      caches: {
        tokenCache: createCacheInstanceMetrics('token'),
        resultCache: createCacheInstanceMetrics('result'),
        templateCache: createCacheInstanceMetrics('template')
      }
    }
  }

  /**
   * Collect throughput metrics
   */
  private collectThroughputMetrics(): ThroughputMetrics {
    const elapsedTime = (Date.now() - this.throughputCounters.startTime) / 1000 // seconds
    
    if (elapsedTime === 0) {
      return {
        testsPerSecond: 0,
        operationsPerSecond: 0,
        bytesPerSecond: 0,
        cacheOperationsPerSecond: 0,
        averageBatchSize: 0
      }
    }
    
    return {
      testsPerSecond: this.throughputCounters.testsProcessed / elapsedTime,
      operationsPerSecond: this.throughputCounters.operationsExecuted / elapsedTime,
      bytesPerSecond: this.throughputCounters.bytesProcessed / elapsedTime,
      cacheOperationsPerSecond: this.throughputCounters.cacheOperations / elapsedTime,
      averageBatchSize: this.config.streaming?.priorityQueue?.batchSize || 0
    }
  }

  /**
   * Collect overhead metrics
   */
  private collectOverheadMetrics(): OverheadMetrics {
    const totalTime = this.overheadTracker.totalTime
    const baselineTime = this.overheadTracker.baselineTime
    
    if (baselineTime === 0) {
      return {
        performanceOverhead: 0,
        streamingOverhead: 0,
        cacheOverhead: 0,
        memoryOverhead: 0,
        totalOverhead: 0
      }
    }
    
    const performanceOverhead = (this.overheadTracker.performanceTime / baselineTime) * 100
    const streamingOverhead = (this.overheadTracker.streamingTime / baselineTime) * 100
    const cacheOverhead = (this.overheadTracker.cacheTime / baselineTime) * 100
    const memoryOverhead = (this.overheadTracker.memoryTime / baselineTime) * 100
    const totalOverhead = ((totalTime - baselineTime) / baselineTime) * 100
    
    return {
      performanceOverhead: Math.max(0, performanceOverhead),
      streamingOverhead: Math.max(0, streamingOverhead),
      cacheOverhead: Math.max(0, cacheOverhead),
      memoryOverhead: Math.max(0, memoryOverhead),
      totalOverhead: Math.max(0, totalOverhead)
    }
  }

  /**
   * Calculate memory pressure level
   */
  private calculateMemoryPressure(usagePercentage: number): MemoryPressureLevel {
    if (usagePercentage < 50) return 'low'
    if (usagePercentage < 75) return 'moderate'
    if (usagePercentage < 90) return 'high'
    return 'critical'
  }

  /**
   * Get cache capacity by name
   */
  private getCacheCapacity(cacheName: string): number {
    switch (cacheName) {
      case 'token': return this.config.cache?.tokenCacheSize || 1000
      case 'result': return this.config.cache?.resultCacheSize || 1000
      case 'template': return this.config.cache?.templateCacheSize || 1000
      default: return 1000
    }
  }

  /**
   * Update overhead tracking
   */
  private updateOverheadTracking(operation: string, duration: number): void {
    this.overheadTracker.totalTime += duration
    
    if (operation.includes('performance')) {
      this.overheadTracker.performanceTime += duration
    } else if (operation.includes('streaming')) {
      this.overheadTracker.streamingTime += duration
    } else if (operation.includes('cache')) {
      this.overheadTracker.cacheTime += duration
    } else if (operation.includes('memory')) {
      this.overheadTracker.memoryTime += duration
    } else {
      this.overheadTracker.baselineTime += duration
    }
  }

  /**
   * Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    const interval = this.config.memory.monitoringInterval
    
    const monitor = () => {
      if (!this.isCollecting) {
        return
      }
      
      try {
        const memUsage = process.memoryUsage()
        const snapshot: MemorySnapshot = {
          timestamp: Date.now(),
          usage: memUsage.heapUsed,
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          external: memUsage.external
        }
        
        this.memorySnapshots.push(snapshot)
        
        // Limit snapshots to prevent memory leaks
        if (this.memorySnapshots.length > 1000) {
          this.memorySnapshots = this.memorySnapshots.slice(-500)
        }
      } catch (error) {
        this.debugError('Memory monitoring error: %O', error)
      }
      
      setTimeout(monitor, interval)
    }
    
    setTimeout(monitor, interval)
  }

  /**
   * Reset throughput counters
   */
  private resetCounters(): void {
    this.throughputCounters = {
      testsProcessed: 0,
      operationsExecuted: 0,
      bytesProcessed: 0,
      cacheOperations: 0,
      startTime: Date.now()
    }
    
    this.overheadTracker = {
      performanceTime: 0,
      streamingTime: 0,
      cacheTime: 0,
      memoryTime: 0,
      totalTime: 0,
      baselineTime: 0
    }
  }

  /**
   * Create empty metrics for fallback
   */
  private createEmptyMetrics(timestamp: number): PerformanceMetrics {
    return {
      timing: {
        totalTime: 0,
        testProcessingTime: 0,
        outputGenerationTime: 0,
        cacheLookupTime: 0,
        averageLatency: 0,
        p95Latency: 0,
        p99Latency: 0
      },
      memory: this.createEmptyMemoryMetrics(),
      cache: {
        hitRatio: 0,
        hits: 0,
        misses: 0,
        size: 0,
        capacity: 0,
        efficiency: 0,
        caches: {
          tokenCache: {
            hitRatio: 0,
            size: 0,
            capacity: 0,
            evictions: 0,
            averageLookupTime: 0
          },
          resultCache: {
            hitRatio: 0,
            size: 0,
            capacity: 0,
            evictions: 0,
            averageLookupTime: 0
          },
          templateCache: {
            hitRatio: 0,
            size: 0,
            capacity: 0,
            evictions: 0,
            averageLookupTime: 0
          }
        }
      },
      throughput: {
        testsPerSecond: 0,
        operationsPerSecond: 0,
        bytesPerSecond: 0,
        cacheOperationsPerSecond: 0,
        averageBatchSize: 0
      },
      overhead: {
        performanceOverhead: 0,
        streamingOverhead: 0,
        cacheOverhead: 0,
        memoryOverhead: 0,
        totalOverhead: 0
      },
      timestamp
    }
  }

  /**
   * Create empty memory metrics
   */
  private createEmptyMemoryMetrics(): MemoryMetrics {
    return {
      currentUsage: 0,
      peakUsage: 0,
      usagePercentage: 0,
      gcCount: 0,
      pressureLevel: 'low',
      poolStats: {
        totalPooled: 0,
        activeObjects: 0,
        poolHitRatio: 0
      }
    }
  }
}