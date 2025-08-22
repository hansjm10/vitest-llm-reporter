/**
 * Performance Optimization Type Definitions
 *
 * Type definitions for the performance optimization system including
 * metrics, caching, memory management, and streaming optimizations.
 *
 * @module performance-types
 */

/**
 * Performance mode configuration
 */
export type PerformanceMode = 'development' | 'production' | 'test' | 'debug'

/**
 * Performance optimization configuration
 */
export interface PerformanceConfig {
  /** Performance mode - affects optimization aggressiveness */
  mode?: PerformanceMode
  /** Enable performance optimizations (default: true) */
  enabled?: boolean
  /** Maximum acceptable overhead percentage (default: 5) */
  maxOverheadPercent?: number
  /** Enable metrics collection (default: true) */
  enableMetrics?: boolean
  /** Enable advanced caching (default: true) */
  enableCaching?: boolean
  /** Enable memory management (default: true) */
  enableMemoryManagement?: boolean
  /** Enable streaming optimizations (default: true) */
  enableStreamingOptimizations?: boolean
  /** Cache configuration */
  cache?: CacheConfig
  /** Memory management configuration */
  memory?: MemoryConfig
  /** Streaming optimization configuration */
  streaming?: StreamingOptimizationConfig
  /** Benchmark configuration */
  benchmark?: BenchmarkConfig
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Enable intelligent caching (default: true) */
  enabled?: boolean
  /** Token counting cache size (default: 10000) */
  tokenCacheSize?: number
  /** Result cache size (default: 5000) */
  resultCacheSize?: number
  /** Template cache size (default: 1000) */
  templateCacheSize?: number
  /** Cache TTL in milliseconds (default: 3600000 = 1 hour) */
  ttl?: number
  /** Target hit ratio percentage (default: 80) */
  targetHitRatio?: number
  /** Enable cache warming (default: true) */
  enableWarming?: boolean
  /** Cache eviction strategy (default: 'lru') */
  evictionStrategy?: CacheEvictionStrategy
  /** Enable multi-tier caching (default: true) */
  enableMultiTier?: boolean
}

/**
 * Cache eviction strategies
 */
export type CacheEvictionStrategy = 'lru' | 'lfu' | 'ttl' | 'adaptive'

/**
 * Memory management configuration
 */
export interface MemoryConfig {
  /** Enable memory management (default: true) */
  enabled?: boolean
  /** Memory pressure threshold in MB (default: 100) */
  pressureThreshold?: number
  /** Enable object pooling (default: true) */
  enablePooling?: boolean
  /** Pool sizes for different object types */
  poolSizes?: {
    /** Test result objects (default: 1000) */
    testResults?: number
    /** Error objects (default: 500) */
    errors?: number
    /** Console output objects (default: 2000) */
    consoleOutputs?: number
  }
  /** Enable memory profiling (default: false in production) */
  enableProfiling?: boolean
  /** Memory monitoring interval in ms (default: 10000) */
  monitoringInterval?: number
}

/**
 * Streaming optimization configuration
 */
export interface StreamingOptimizationConfig {
  /** Enable streaming optimizations (default: true) */
  enabled?: boolean
  /** Enable adaptive buffering (default: true) */
  enableAdaptiveBuffering?: boolean
  /** Buffer size limits */
  bufferLimits?: {
    /** Minimum buffer size in bytes (default: 1024) */
    min?: number
    /** Maximum buffer size in bytes (default: 1048576 = 1MB) */
    max?: number
    /** Initial buffer size in bytes (default: 8192) */
    initial?: number
  }
  /** Enable background processing (default: true) */
  enableBackgroundProcessing?: boolean
  /** Priority queue configuration */
  priorityQueue?: {
    /** Maximum queue size (default: 10000) */
    maxSize?: number
    /** Processing batch size (default: 100) */
    batchSize?: number
    /** Processing interval in ms (default: 100) */
    processingInterval?: number
  }
}

/**
 * Benchmark configuration
 */
export interface BenchmarkConfig {
  /** Enable benchmarking (default: false) */
  enabled?: boolean
  /** Benchmark suite to run */
  suite?: BenchmarkSuite
  /** Benchmark thresholds */
  thresholds?: BenchmarkThresholds
  /** Sample size for benchmarks (default: 100) */
  sampleSize?: number
  /** Warmup iterations (default: 10) */
  warmupIterations?: number
}

/**
 * Benchmark suite types
 */
export type BenchmarkSuite = 'basic' | 'comprehensive' | 'stress' | 'custom'

/**
 * Benchmark thresholds
 */
export interface BenchmarkThresholds {
  /** Maximum acceptable latency in ms */
  maxLatency?: number
  /** Maximum acceptable memory usage in MB */
  maxMemoryUsage?: number
  /** Maximum acceptable overhead percentage */
  maxOverhead?: number
  /** Minimum required throughput (operations/sec) */
  minThroughput?: number
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  /** Timing metrics */
  timing: TimingMetrics
  /** Memory metrics */
  memory: MemoryMetrics
  /** Cache metrics */
  cache: CacheMetrics
  /** Throughput metrics */
  throughput: ThroughputMetrics
  /** Overhead metrics */
  overhead: OverheadMetrics
  /** Timestamp when metrics were collected */
  timestamp: number
}

/**
 * Timing metrics
 */
export interface TimingMetrics {
  /** Total execution time in milliseconds */
  totalTime: number
  /** Test processing time in milliseconds */
  testProcessingTime: number
  /** Output generation time in milliseconds */
  outputGenerationTime: number
  /** Cache lookup time in milliseconds */
  cacheLookupTime: number
  /** Average operation latency in milliseconds */
  averageLatency: number
  /** 95th percentile latency in milliseconds */
  p95Latency: number
  /** 99th percentile latency in milliseconds */
  p99Latency: number
}

/**
 * Memory metrics
 */
export interface MemoryMetrics {
  /** Current memory usage in bytes */
  currentUsage: number
  /** Peak memory usage in bytes */
  peakUsage: number
  /** Memory usage percentage of available */
  usagePercentage: number
  /** Number of garbage collections */
  gcCount: number
  /** Memory pressure level */
  pressureLevel: MemoryPressureLevel
  /** Pool statistics */
  poolStats: {
    /** Total objects in pools */
    totalPooled: number
    /** Active objects */
    activeObjects: number
    /** Pool hit ratio */
    poolHitRatio: number
  }
}

/**
 * Memory pressure levels
 */
export type MemoryPressureLevel = 'low' | 'moderate' | 'high' | 'critical'

/**
 * Cache metrics
 */
export interface CacheMetrics {
  /** Cache hit ratio as percentage */
  hitRatio: number
  /** Total cache hits */
  hits: number
  /** Total cache misses */
  misses: number
  /** Cache size (number of entries) */
  size: number
  /** Cache capacity */
  capacity: number
  /** Cache efficiency score */
  efficiency: number
  /** Per-cache metrics */
  caches: {
    /** Token counting cache metrics */
    tokenCache: CacheInstanceMetrics
    /** Result cache metrics */
    resultCache: CacheInstanceMetrics
    /** Template cache metrics */
    templateCache: CacheInstanceMetrics
  }
}

/**
 * Individual cache instance metrics
 */
export interface CacheInstanceMetrics {
  /** Hit ratio for this cache */
  hitRatio: number
  /** Number of entries */
  size: number
  /** Cache capacity */
  capacity: number
  /** Eviction count */
  evictions: number
  /** Average lookup time in ms */
  averageLookupTime: number
}

/**
 * Throughput metrics
 */
export interface ThroughputMetrics {
  /** Tests processed per second */
  testsPerSecond: number
  /** Operations per second */
  operationsPerSecond: number
  /** Bytes processed per second */
  bytesPerSecond: number
  /** Cache operations per second */
  cacheOperationsPerSecond: number
  /** Average batch size */
  averageBatchSize: number
}

/**
 * Overhead metrics
 */
export interface OverheadMetrics {
  /** Performance system overhead percentage */
  performanceOverhead: number
  /** Streaming overhead percentage */
  streamingOverhead: number
  /** Cache overhead percentage */
  cacheOverhead: number
  /** Memory management overhead percentage */
  memoryOverhead: number
  /** Total overhead percentage */
  totalOverhead: number
}

/**
 * Benchmark result
 */
export interface BenchmarkResult {
  /** Suite name */
  suite: string
  /** Test name */
  testName: string
  /** Mean execution time in milliseconds */
  meanTime: number
  /** Standard deviation in milliseconds */
  standardDeviation: number
  /** Minimum time in milliseconds */
  minTime: number
  /** Maximum time in milliseconds */
  maxTime: number
  /** Samples count */
  samples: number
  /** Operations per second */
  opsPerSecond: number
  /** Memory usage in bytes */
  memoryUsage: number
  /** Success rate as percentage */
  successRate: number
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Performance optimization result
 */
export interface OptimizationResult {
  /** Whether optimization was applied */
  applied: boolean
  /** Performance improvement percentage */
  improvement: number
  /** Optimization type */
  type: OptimizationType
  /** Description of optimization */
  description: string
  /** Before metrics */
  before: PerformanceMetrics
  /** After metrics */
  after: PerformanceMetrics
  /** Duration of optimization in milliseconds */
  duration: number
}

/**
 * Types of optimizations
 */
export type OptimizationType =
  | 'cache_warming'
  | 'memory_cleanup'
  | 'buffer_adjustment'
  | 'priority_reordering'
  | 'pool_expansion'
  | 'adaptive_tuning'

/**
 * Performance event types
 */
export type PerformanceEventType =
  | 'metrics_collected'
  | 'optimization_applied'
  | 'threshold_exceeded'
  | 'cache_warmed'
  | 'memory_pressure'
  | 'benchmark_completed'

/**
 * Performance event
 */
export interface PerformanceEvent {
  /** Event type */
  type: PerformanceEventType
  /** Event timestamp */
  timestamp: number
  /** Event data */
  data: unknown
  /** Event severity */
  severity: 'info' | 'warning' | 'error'
  /** Source component */
  source: string
}

/**
 * Performance manager interface
 */
export interface IPerformanceManager {
  /** Initialize the performance system */
  initialize(config: PerformanceConfig): Promise<void>
  /** Start performance monitoring */
  start(): void
  /** Stop performance monitoring */
  stop(): void
  /** Get current metrics */
  getMetrics(): PerformanceMetrics
  /** Apply optimizations */
  optimize(): Promise<OptimizationResult[]>
  /** Run benchmarks */
  benchmark(suite?: BenchmarkSuite): Promise<BenchmarkResult[]>
  /** Reset performance state */
  reset(): void
  /** Check if overhead is within limits */
  isWithinLimits(): boolean
}

/**
 * Metrics collector interface
 */
export interface IMetricsCollector {
  /** Collect current metrics */
  collect(): PerformanceMetrics
  /** Start collecting metrics */
  start(): void
  /** Stop collecting metrics */
  stop(): void
  /** Get metrics history */
  getHistory(): PerformanceMetrics[]
  /** Clear metrics history */
  clearHistory(): void
}

/**
 * Cache manager interface
 */
export interface ICacheManager {
  /** Get cache instance by name */
  getCache(name: string): ICache | undefined
  /** Warm up caches */
  warmup(): Promise<void>
  /** Clear all caches */
  clearAll(): void
  /** Get aggregate cache metrics */
  getMetrics(): CacheMetrics
  /** Optimize cache configuration */
  optimize(): Promise<void>
}

/**
 * Generic cache interface
 */
export interface ICache {
  /** Get value by key */
  get(key: string): unknown
  /** Set key-value pair */
  set(key: string, value: unknown, ttl?: number): void
  /** Check if key exists */
  has(key: string): boolean
  /** Delete key */
  delete(key: string): boolean
  /** Clear all entries */
  clear(): void
  /** Get cache size */
  size(): number
  /** Get cache metrics */
  getMetrics(): CacheInstanceMetrics
}

/**
 * Memory manager interface
 */
export interface IMemoryManager {
  /** Get current memory usage */
  getUsage(): MemoryMetrics
  /** Check memory pressure */
  checkPressure(): MemoryPressureLevel
  /** Clean up memory */
  cleanup(): Promise<void>
  /** Get object from pool */
  getPooledObject<T>(type: string): T | undefined
  /** Return object to pool */
  returnToPool<T>(type: string, obj: T): void
  /** Optimize memory usage */
  optimize(): Promise<void>
}

/**
 * Stream optimizer interface
 */
export interface IStreamOptimizer {
  /** Optimize buffer size */
  optimizeBuffer(currentSize: number, metrics: PerformanceMetrics): number
  /** Process in background */
  processInBackground<T>(tasks: T[], processor: (task: T) => Promise<void>): Promise<void>
  /** Get optimal batch size */
  getOptimalBatchSize(): number
  /** Adjust processing priority */
  adjustPriority(taskId: string, priority: number): void
}
