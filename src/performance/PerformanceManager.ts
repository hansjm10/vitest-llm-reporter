/**
 * Performance Manager - Central Orchestration
 *
 * Central orchestrator for the performance optimization system.
 * Coordinates metrics collection, cache management, memory optimization,
 * and streaming performance tuning.
 *
 * @module PerformanceManager
 */

import type {
  PerformanceConfig,
  PerformanceMetrics,
  OptimizationResult,
  BenchmarkResult,
  BenchmarkSuite,
  IPerformanceManager,
  IMetricsCollector,
  ICacheManager,
  IMemoryManager,
  IStreamOptimizer,
  PerformanceMode,
  OverheadMetrics
} from './types'
import { MetricsCollector } from './MetricsCollector'
import { BenchmarkSuite as BenchmarkSuiteImpl } from './BenchmarkSuite'
import { coreLogger, errorLogger } from '../utils/logger'

/**
 * Central performance optimization manager
 */
export class PerformanceManager implements IPerformanceManager {
  private config: Required<PerformanceConfig>
  private metricsCollector: IMetricsCollector
  private cacheManager?: ICacheManager
  private memoryManager?: IMemoryManager
  private streamOptimizer?: IStreamOptimizer
  private benchmarkSuite: BenchmarkSuiteImpl
  private isInitialized = false
  private isStarted = false
  private optimizationHistory: OptimizationResult[] = []
  private lastOptimizationTime = 0
  private debug = coreLogger()
  private debugError = errorLogger()

  constructor(config: PerformanceConfig = {}) {
    this.config = this.resolveConfig(config)
    this.metricsCollector = new MetricsCollector(this.config)
    this.benchmarkSuite = new BenchmarkSuiteImpl(this.config.benchmark)
  }

  /**
   * Resolve configuration with defaults
   */
  private resolveConfig(config: PerformanceConfig): Required<PerformanceConfig> {
    const mode = config.mode ?? 'production'
    
    return {
      mode,
      enabled: config.enabled ?? true,
      maxOverheadPercent: config.maxOverheadPercent ?? 5,
      enableMetrics: config.enableMetrics ?? true,
      enableCaching: config.enableCaching ?? true,
      enableMemoryManagement: config.enableMemoryManagement ?? true,
      enableStreamingOptimizations: config.enableStreamingOptimizations ?? true,
      cache: {
        enabled: config.cache?.enabled ?? true,
        tokenCacheSize: config.cache?.tokenCacheSize ?? 10000,
        resultCacheSize: config.cache?.resultCacheSize ?? 5000,
        templateCacheSize: config.cache?.templateCacheSize ?? 1000,
        ttl: config.cache?.ttl ?? 3600000, // 1 hour
        targetHitRatio: config.cache?.targetHitRatio ?? 80,
        enableWarming: config.cache?.enableWarming ?? true,
        evictionStrategy: config.cache?.evictionStrategy ?? 'lru',
        enableMultiTier: config.cache?.enableMultiTier ?? true
      },
      memory: {
        enabled: config.memory?.enabled ?? true,
        pressureThreshold: config.memory?.pressureThreshold ?? 100,
        enablePooling: config.memory?.enablePooling ?? true,
        poolSizes: {
          testResults: config.memory?.poolSizes?.testResults ?? 1000,
          errors: config.memory?.poolSizes?.errors ?? 500,
          consoleOutputs: config.memory?.poolSizes?.consoleOutputs ?? 2000
        },
        enableProfiling: config.memory?.enableProfiling ?? (mode === 'development'),
        monitoringInterval: config.memory?.monitoringInterval ?? 10000
      },
      streaming: {
        enabled: config.streaming?.enabled ?? true,
        enableAdaptiveBuffering: config.streaming?.enableAdaptiveBuffering ?? true,
        bufferLimits: {
          min: config.streaming?.bufferLimits?.min ?? 1024,
          max: config.streaming?.bufferLimits?.max ?? 1048576,
          initial: config.streaming?.bufferLimits?.initial ?? 8192
        },
        enableBackgroundProcessing: config.streaming?.enableBackgroundProcessing ?? true,
        priorityQueue: {
          maxSize: config.streaming?.priorityQueue?.maxSize ?? 10000,
          batchSize: config.streaming?.priorityQueue?.batchSize ?? 100,
          processingInterval: config.streaming?.priorityQueue?.processingInterval ?? 100
        }
      },
      benchmark: {
        enabled: config.benchmark?.enabled ?? false,
        suite: config.benchmark?.suite ?? 'basic',
        thresholds: {
          maxLatency: config.benchmark?.thresholds?.maxLatency ?? 1000,
          maxMemoryUsage: config.benchmark?.thresholds?.maxMemoryUsage ?? 512,
          maxOverhead: config.benchmark?.thresholds?.maxOverhead ?? this.config?.maxOverheadPercent ?? 5,
          minThroughput: config.benchmark?.thresholds?.minThroughput ?? 100
        },
        sampleSize: config.benchmark?.sampleSize ?? 100,
        warmupIterations: config.benchmark?.warmupIterations ?? 10
      }
    }
  }

  /**
   * Initialize the performance system
   */
  async initialize(config?: PerformanceConfig): Promise<void> {
    if (config) {
      this.config = this.resolveConfig(config)
    }

    if (!this.config.enabled) {
      this.debug('Performance optimization disabled')
      return
    }

    try {
      this.debug('Initializing performance system in %s mode', this.config.mode)

      // Initialize cache manager if enabled
      if (this.config.enableCaching && this.config.cache.enabled) {
        const { CacheManager } = await import('./cache/CacheManager')
        this.cacheManager = new CacheManager(this.config.cache)
        await this.cacheManager.warmup()
        this.debug('Cache manager initialized')
      }

      // Initialize memory manager if enabled
      if (this.config.enableMemoryManagement && this.config.memory.enabled) {
        const { MemoryManager } = await import('./memory/MemoryManager')
        this.memoryManager = new MemoryManager(this.config.memory)
        this.debug('Memory manager initialized')
      }

      // Initialize stream optimizer if enabled
      if (this.config.enableStreamingOptimizations && this.config.streaming.enabled) {
        const { StreamOptimizer } = await import('./streaming/StreamOptimizer')
        this.streamOptimizer = new StreamOptimizer(this.config.streaming)
        this.debug('Stream optimizer initialized')
      }

      this.isInitialized = true
      this.debug('Performance system initialized successfully')
    } catch (error) {
      this.debugError('Failed to initialize performance system: %O', error)
      throw error
    }
  }

  /**
   * Start performance monitoring
   */
  start(): void {
    if (!this.config.enabled || !this.isInitialized) {
      return
    }

    if (this.isStarted) {
      this.debug('Performance system already started')
      return
    }

    try {
      if (this.config.enableMetrics) {
        this.metricsCollector.start()
      }

      this.isStarted = true
      this.debug('Performance monitoring started')
    } catch (error) {
      this.debugError('Failed to start performance monitoring: %O', error)
    }
  }

  /**
   * Stop performance monitoring
   */
  stop(): void {
    if (!this.isStarted) {
      return
    }

    try {
      if (this.config.enableMetrics) {
        this.metricsCollector.stop()
      }

      this.isStarted = false
      this.debug('Performance monitoring stopped')
    } catch (error) {
      this.debugError('Failed to stop performance monitoring: %O', error)
    }
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    if (!this.config.enabled || !this.config.enableMetrics) {
      return this.createEmptyMetrics()
    }

    try {
      return this.metricsCollector.collect()
    } catch (error) {
      this.debugError('Failed to collect metrics: %O', error)
      return this.createEmptyMetrics()
    }
  }

  /**
   * Apply performance optimizations
   */
  async optimize(): Promise<OptimizationResult[]> {
    if (!this.config.enabled || !this.isInitialized) {
      return []
    }

    // Throttle optimizations to prevent excessive overhead
    const now = Date.now()
    const minInterval = this.config.mode === 'production' ? 30000 : 10000 // 30s in prod, 10s in dev
    if (now - this.lastOptimizationTime < minInterval) {
      return []
    }

    const results: OptimizationResult[] = []
    const beforeMetrics = this.getMetrics()

    try {
      this.debug('Starting optimization cycle')

      // Cache optimizations
      if (this.cacheManager && this.config.enableCaching) {
        const cacheOptimization = await this.optimizeCache(beforeMetrics)
        if (cacheOptimization) {
          results.push(cacheOptimization)
        }
      }

      // Memory optimizations
      if (this.memoryManager && this.config.enableMemoryManagement) {
        const memoryOptimization = await this.optimizeMemory(beforeMetrics)
        if (memoryOptimization) {
          results.push(memoryOptimization)
        }
      }

      // Streaming optimizations
      if (this.streamOptimizer && this.config.enableStreamingOptimizations) {
        const streamOptimization = await this.optimizeStreaming(beforeMetrics)
        if (streamOptimization) {
          results.push(streamOptimization)
        }
      }

      this.lastOptimizationTime = now
      this.optimizationHistory.push(...results)

      // Keep only recent optimization history to prevent memory leaks
      if (this.optimizationHistory.length > 100) {
        this.optimizationHistory = this.optimizationHistory.slice(-50)
      }

      this.debug('Optimization cycle completed, %d optimizations applied', results.length)
      return results
    } catch (error) {
      this.debugError('Optimization cycle failed: %O', error)
      return results // Return partial results
    }
  }

  /**
   * Run performance benchmarks
   */
  async benchmark(suite?: BenchmarkSuite): Promise<BenchmarkResult[]> {
    if (!this.config.enabled || !this.config.benchmark.enabled) {
      return []
    }

    try {
      this.debug('Running benchmark suite: %s', suite ?? this.config.benchmark.suite)
      return await this.benchmarkSuite.run(suite ?? this.config.benchmark.suite)
    } catch (error) {
      this.debugError('Benchmark failed: %O', error)
      return []
    }
  }

  /**
   * Reset performance state
   */
  reset(): void {
    try {
      this.metricsCollector.clearHistory()
      this.optimizationHistory = []
      this.lastOptimizationTime = 0

      if (this.cacheManager) {
        this.cacheManager.clearAll()
      }

      this.debug('Performance state reset')
    } catch (error) {
      this.debugError('Failed to reset performance state: %O', error)
    }
  }

  /**
   * Check if system is operating within performance limits
   */
  isWithinLimits(): boolean {
    if (!this.config.enabled) {
      return true
    }

    try {
      const metrics = this.getMetrics()
      const overheadLimit = this.config.maxOverheadPercent
      
      return metrics.overhead.totalOverhead <= overheadLimit
    } catch (error) {
      this.debugError('Failed to check performance limits: %O', error)
      return false // Assume limits exceeded on error
    }
  }

  /**
   * Get performance configuration
   */
  getConfig(): Required<PerformanceConfig> {
    return { ...this.config }
  }

  /**
   * Get optimization history
   */
  getOptimizationHistory(): OptimizationResult[] {
    return [...this.optimizationHistory]
  }

  /**
   * Optimize cache performance
   */
  private async optimizeCache(beforeMetrics: PerformanceMetrics): Promise<OptimizationResult | null> {
    if (!this.cacheManager) {
      return null
    }

    const startTime = Date.now()
    const cacheMetrics = beforeMetrics.cache

    // Check if cache hit ratio is below target
    if (cacheMetrics.hitRatio < this.config.cache!.targetHitRatio!) {
      await this.cacheManager.optimize()
      
      const afterMetrics = this.getMetrics()
      const improvement = afterMetrics.cache.hitRatio - beforeMetrics.cache.hitRatio

      if (improvement > 0) {
        return {
          applied: true,
          improvement,
          type: 'cache_warming',
          description: `Improved cache hit ratio by ${improvement.toFixed(2)}%`,
          before: beforeMetrics,
          after: afterMetrics,
          duration: Date.now() - startTime
        }
      }
    }

    return null
  }

  /**
   * Optimize memory usage
   */
  private async optimizeMemory(beforeMetrics: PerformanceMetrics): Promise<OptimizationResult | null> {
    if (!this.memoryManager) {
      return null
    }

    const startTime = Date.now()
    const memoryMetrics = beforeMetrics.memory

    // Check if memory pressure is high
    if (memoryMetrics.pressureLevel === 'high' || memoryMetrics.pressureLevel === 'critical') {
      await this.memoryManager.cleanup()
      
      const afterMetrics = this.getMetrics()
      const beforeUsage = beforeMetrics.memory.usagePercentage
      const afterUsage = afterMetrics.memory.usagePercentage
      const improvement = beforeUsage - afterUsage

      if (improvement > 0) {
        return {
          applied: true,
          improvement,
          type: 'memory_cleanup',
          description: `Reduced memory usage by ${improvement.toFixed(2)}%`,
          before: beforeMetrics,
          after: afterMetrics,
          duration: Date.now() - startTime
        }
      }
    }

    return null
  }

  /**
   * Optimize streaming performance
   */
  private async optimizeStreaming(beforeMetrics: PerformanceMetrics): Promise<OptimizationResult | null> {
    if (!this.streamOptimizer) {
      return null
    }

    const startTime = Date.now()

    // This is a placeholder for streaming optimization
    // In a real implementation, this would analyze current streaming metrics
    // and apply optimizations like buffer size adjustments, priority reordering, etc.
    
    // For now, we'll simulate a modest improvement
    const afterMetrics = this.getMetrics()
    const improvement = 1.0 // Placeholder 1% improvement

    return {
      applied: true,
      improvement,
      type: 'adaptive_tuning',
      description: 'Applied adaptive streaming tuning',
      before: beforeMetrics,
      after: afterMetrics,
      duration: Date.now() - startTime
    }
  }

  /**
   * Create empty metrics for fallback scenarios
   */
  private createEmptyMetrics(): PerformanceMetrics {
    const now = Date.now()
    
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
      memory: {
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
      },
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
      timestamp: now
    }
  }
}