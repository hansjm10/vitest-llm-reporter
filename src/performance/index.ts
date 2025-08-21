/**
 * Performance Optimization System - Main Exports
 *
 * Central export point for the performance optimization system.
 * Provides access to all performance-related components and utilities.
 *
 * @module performance
 */

// Import types for internal use
import type {
  PerformanceConfig,
  BenchmarkConfig,
  PerformanceMode
} from './types'

// Re-export type definitions
export type {
  PerformanceConfig,
  PerformanceMetrics,
  BenchmarkResult,
  OptimizationResult,
  TimingMetrics,
  MemoryMetrics,
  CacheMetrics,
  ThroughputMetrics,
  OverheadMetrics,
  BenchmarkConfig,
  BenchmarkThresholds,
  CacheConfig,
  MemoryConfig,
  StreamingOptimizationConfig,
  PerformanceMode,
  BenchmarkSuite as BenchmarkSuiteType,
  CacheEvictionStrategy,
  MemoryPressureLevel,
  OptimizationType,
  PerformanceEventType,
  PerformanceEvent,
  CacheInstanceMetrics,
  IPerformanceManager,
  IMetricsCollector,
  ICacheManager,
  ICache,
  IMemoryManager,
  IStreamOptimizer
} from './types'

// Import for internal use
import { PerformanceManager } from './PerformanceManager'
import { MetricsCollector } from './MetricsCollector'
import { BenchmarkSuite } from './BenchmarkSuite'

// Core components
export { PerformanceManager } from './PerformanceManager'
export { MetricsCollector } from './MetricsCollector'
export { BenchmarkSuite } from './BenchmarkSuite'

// Cache system exports
export * from './cache'

// Memory management exports  
export * from './memory'

// Streaming optimization exports
export * from './streaming'

/**
 * Create a performance manager with default configuration
 * 
 * @param config Optional performance configuration
 * @returns Configured PerformanceManager instance
 */
export function createPerformanceManager(config?: PerformanceConfig): PerformanceManager {
  return new PerformanceManager(config)
}

/**
 * Create a metrics collector with default configuration
 * 
 * @param config Performance configuration
 * @returns Configured MetricsCollector instance
 */
export function createMetricsCollector(config: Required<PerformanceConfig>): MetricsCollector {
  return new MetricsCollector(config)
}

/**
 * Create a benchmark suite with default configuration
 * 
 * @param config Optional benchmark configuration
 * @returns Configured BenchmarkSuite instance
 */
export function createBenchmarkSuite(config?: BenchmarkConfig): BenchmarkSuite {
  return new BenchmarkSuite(config ?? {})
}

/**
 * Default performance configuration for production use
 */
export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  mode: 'production',
  enabled: true,
  maxOverheadPercent: 5,
  enableMetrics: true,
  enableCaching: true,
  enableMemoryManagement: true,
  enableStreamingOptimizations: true,
  cache: {
    enabled: true,
    tokenCacheSize: 10000,
    resultCacheSize: 5000,
    templateCacheSize: 1000,
    ttl: 3600000, // 1 hour
    targetHitRatio: 80,
    enableWarming: true,
    evictionStrategy: 'lru',
    enableMultiTier: true
  },
  memory: {
    enabled: true,
    pressureThreshold: 100,
    enablePooling: true,
    poolSizes: {
      testResults: 1000,
      errors: 500,
      consoleOutputs: 2000
    },
    enableProfiling: false,
    monitoringInterval: 10000
  },
  streaming: {
    enabled: true,
    enableAdaptiveBuffering: true,
    bufferLimits: {
      min: 1024,
      max: 1048576,
      initial: 8192
    },
    enableBackgroundProcessing: true,
    priorityQueue: {
      maxSize: 10000,
      batchSize: 100,
      processingInterval: 100
    }
  },
  benchmark: {
    enabled: false,
    suite: 'basic',
    thresholds: {
      maxLatency: 1000,
      maxMemoryUsage: 512,
      maxOverhead: 5,
      minThroughput: 100
    },
    sampleSize: 100,
    warmupIterations: 10
  }
}

/**
 * Development performance configuration with more aggressive monitoring
 */
export const DEVELOPMENT_PERFORMANCE_CONFIG: PerformanceConfig = {
  ...DEFAULT_PERFORMANCE_CONFIG,
  mode: 'development',
  maxOverheadPercent: 10, // Allow higher overhead in development
  memory: {
    ...DEFAULT_PERFORMANCE_CONFIG.memory!,
    enableProfiling: true,
    monitoringInterval: 5000 // More frequent monitoring
  },
  benchmark: {
    ...DEFAULT_PERFORMANCE_CONFIG.benchmark!,
    enabled: true,
    suite: 'comprehensive'
  }
}

/**
 * Test performance configuration optimized for testing environments
 */
export const TEST_PERFORMANCE_CONFIG: PerformanceConfig = {
  ...DEFAULT_PERFORMANCE_CONFIG,
  mode: 'test',
  enableMetrics: false, // Reduce overhead in tests
  cache: {
    ...DEFAULT_PERFORMANCE_CONFIG.cache!,
    tokenCacheSize: 100,
    resultCacheSize: 50,
    templateCacheSize: 25,
    enableWarming: false
  },
  memory: {
    ...DEFAULT_PERFORMANCE_CONFIG.memory!,
    enableProfiling: false,
    monitoringInterval: 30000,
    poolSizes: {
      testResults: 100,
      errors: 50,
      consoleOutputs: 200
    }
  }
}

/**
 * Get performance configuration for a specific mode
 * 
 * @param mode Performance mode
 * @returns Appropriate performance configuration
 */
export function getPerformanceConfigForMode(mode: PerformanceMode): PerformanceConfig {
  switch (mode) {
    case 'development':
      return DEVELOPMENT_PERFORMANCE_CONFIG
    case 'test':
      return TEST_PERFORMANCE_CONFIG
    case 'debug':
      return {
        ...DEVELOPMENT_PERFORMANCE_CONFIG,
        mode: 'debug',
        maxOverheadPercent: 15,
        benchmark: {
          ...DEVELOPMENT_PERFORMANCE_CONFIG.benchmark!,
          enabled: true,
          suite: 'stress'
        }
      }
    case 'production':
    default:
      return DEFAULT_PERFORMANCE_CONFIG
  }
}

/**
 * Validate performance configuration
 * 
 * @param config Performance configuration to validate
 * @throws Error if configuration is invalid
 */
export function validatePerformanceConfig(config: PerformanceConfig): void {
  if (config.maxOverheadPercent !== undefined && config.maxOverheadPercent < 0) {
    throw new Error('maxOverheadPercent must be non-negative')
  }
  
  if (config.cache?.tokenCacheSize !== undefined && config.cache.tokenCacheSize < 0) {
    throw new Error('tokenCacheSize must be non-negative')
  }
  
  if (config.memory?.pressureThreshold !== undefined && config.memory.pressureThreshold < 0) {
    throw new Error('pressureThreshold must be non-negative')
  }
  
  if (config.benchmark?.sampleSize !== undefined && config.benchmark.sampleSize < 1) {
    throw new Error('sampleSize must be at least 1')
  }
}