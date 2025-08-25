/**
 * Mock Implementations for Integration Tests
 *
 * Provides mock implementations of core interfaces for testing
 */

import type {
  IDeduplicationService,
  DeduplicationConfig,
  DeduplicationResult
} from '../../src/types/deduplication'
import type {
  IPerformanceManager,
  PerformanceConfig,
  PerformanceMetrics
} from '../../src/performance/types'
import type { LLMReporterOutput } from '../../src/types/schema'

/**
 * Mock Deduplication Service for testing
 */
export class MockDeduplicationService implements IDeduplicationService {
  private config: DeduplicationConfig
  private processedCount = 0

  constructor(config: DeduplicationConfig) {
    this.config = { ...config }
  }

  async processOutput(output: LLMReporterOutput): Promise<DeduplicationResult> {
    await Promise.resolve()
    this.processedCount++

    if (!this.config.enabled) {
      return {
        originalCount: output.failures?.length || 0,
        deduplicatedCount: output.failures?.length || 0,
        groups: [],
        references: [],
        stats: {
          totalFailures: output.failures?.length || 0,
          uniqueFailures: output.failures?.length || 0,
          duplicateGroups: 0,
          compressionRatio: 1.0,
          processingTime: 10
        }
      }
    }

    // Simple mock deduplication: group every 2 similar failures
    const failures = output.failures || []
    const groups = []
    const references = []
    let groupIndex = 0

    for (let i = 0; i < failures.length; i += 2) {
      if (i + 1 < failures.length) {
        // Create a group for pairs
        groups.push({
          id: `group-${groupIndex}`,
          pattern: 'mock-pattern',
          template: failures[i],
          instances: [failures[i], failures[i + 1]],
          similarity: 0.9,
          count: 2
        })

        references.push({
          original: failures[i],
          groupId: `group-${groupIndex}`,
          isDuplicate: false
        })

        references.push({
          original: failures[i + 1],
          groupId: `group-${groupIndex}`,
          isDuplicate: true
        })

        groupIndex++
      } else {
        // Single failure, no grouping
        references.push({
          original: failures[i],
          groupId: null,
          isDuplicate: false
        })
      }
    }

    return {
      originalCount: failures.length,
      deduplicatedCount: failures.length - Math.floor(failures.length / 2),
      groups,
      references,
      stats: {
        totalFailures: failures.length,
        uniqueFailures: failures.length - Math.floor(failures.length / 2),
        duplicateGroups: groups.length,
        compressionRatio:
          failures.length > 0
            ? (failures.length - Math.floor(failures.length / 2)) / failures.length
            : 1.0,
        processingTime: 25
      }
    }
  }

  getConfig(): DeduplicationConfig {
    return { ...this.config }
  }

  updateConfig(newConfig: Partial<DeduplicationConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  // Test utilities
  getProcessedCount(): number {
    return this.processedCount
  }

  reset(): void {
    this.processedCount = 0
  }
}

// Simplified metrics type for mock
interface MockMetrics {
  totalOperations: number
  averageLatency: number
  peakMemoryUsage: number
  cacheHitRate: number
  optimizationSavings: number
  lastUpdateTime: number
}

/**
 * Mock Performance Manager for testing
 */
export class MockPerformanceManager implements IPerformanceManager {
  private config: PerformanceConfig
  private mockMetrics: MockMetrics
  private optimizationCount = 0

  constructor(config: PerformanceConfig = {}) {
    this.config = {
      enabled: false,
      mode: 'balanced',
      enableCaching: false,
      enableMemoryOptimization: false,
      enableStreamOptimization: false,
      ...config
    }

    this.mockMetrics = {
      totalOperations: 0,
      averageLatency: 0,
      peakMemoryUsage: 100, // Start with non-zero memory value
      cacheHitRate: 0,
      optimizationSavings: 0,
      lastUpdateTime: Date.now()
    }
  }

  async initialize(): Promise<void> {
    // Mock initialization
    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  start(): void {
    if (!this.config.enabled) return
    // Mock start
  }

  stop(): void {
    // Mock stop
  }

  async optimize(): Promise<void> {
    if (!this.config.enabled) return

    this.optimizationCount++

    // Mock optimization effects
    this.mockMetrics = {
      ...this.mockMetrics,
      totalOperations: this.mockMetrics.totalOperations + 1,
      averageLatency: Math.max(0, this.mockMetrics.averageLatency - 5), // Simulate improvement
      cacheHitRate: Math.min(1, this.mockMetrics.cacheHitRate + 0.1),
      optimizationSavings: this.mockMetrics.optimizationSavings + 10,
      peakMemoryUsage: Math.max(
        this.mockMetrics.peakMemoryUsage,
        100 + this.mockMetrics.totalOperations * 10
      ), // Simulate memory usage
      lastUpdateTime: Date.now()
    }

    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  getMetrics(): PerformanceMetrics {
    // Convert mock metrics to full PerformanceMetrics structure
    return {
      timing: {
        totalTime: this.mockMetrics.averageLatency,
        testProcessingTime: this.mockMetrics.averageLatency,
        outputGenerationTime: 0,
        cacheLookupTime: 0,
        averageLatency: this.mockMetrics.averageLatency,
        p95Latency: this.mockMetrics.averageLatency * 1.5,
        p99Latency: this.mockMetrics.averageLatency * 2
      },
      memory: {
        currentUsage: this.mockMetrics.peakMemoryUsage,
        peakUsage: this.mockMetrics.peakMemoryUsage,
        usagePercentage: 50,
        gcCount: 0,
        pressureLevel: 'low' as const,
        poolStats: {
          totalPooled: 0,
          activeObjects: 0,
          poolHitRatio: 0
        }
      },
      cache: {
        hitRatio: this.mockMetrics.cacheHitRate,
        hits: Math.round(this.mockMetrics.cacheHitRate * 100),
        misses: Math.round((1 - this.mockMetrics.cacheHitRate) * 100),
        size: 0,
        capacity: 100,
        evictionCount: 0
      },
      throughput: {
        testsPerSecond:
          this.mockMetrics.totalOperations / Math.max(1, this.mockMetrics.averageLatency / 1000),
        operationsPerSecond: this.mockMetrics.totalOperations,
        bytesPerSecond: 0,
        cacheOperationsPerSecond: 0,
        averageBatchSize: 1
      },
      overhead: {
        performanceOverhead: 0,
        streamingOverhead: 0,
        cacheOverhead: 0,
        memoryOverhead: 0,
        totalOverhead: this.mockMetrics.optimizationSavings
      },
      timestamp: this.mockMetrics.lastUpdateTime
    }
  }

  getConfig(): PerformanceConfig {
    return { ...this.config }
  }

  updateConfig(newConfig: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  // Test utilities
  getOptimizationCount(): number {
    return this.optimizationCount
  }

  simulateLoad(operations: number): void {
    this.mockMetrics.totalOperations += operations
    this.mockMetrics.averageLatency += operations * 0.1
    this.mockMetrics.peakMemoryUsage = Math.max(this.mockMetrics.peakMemoryUsage, operations * 1024)
    this.mockMetrics.lastUpdateTime = Date.now()
  }

  reset(): void {
    this.optimizationCount = 0
    this.mockMetrics = {
      totalOperations: 0,
      averageLatency: 0,
      peakMemoryUsage: 0,
      cacheHitRate: 0,
      optimizationSavings: 0,
      lastUpdateTime: Date.now()
    }
  }
}

/**
 * Integration test helper that creates connected mock services
 */
export function createIntegratedMockServices(): Record<string, unknown> {
  const deduplicationService = new MockDeduplicationService({
    enabled: true,
    strategy: 'moderate',
    thresholds: { exact: 1.0, high: 0.9, medium: 0.7, low: 0.5 },
    patterns: { stackTrace: true, errorMessage: true, consoleOutput: true, assertion: true },
    compression: { enabled: true, minGroupSize: 2, maxTemplateVariables: 10, preserveExamples: 3 }
  })
  const performanceManager = new MockPerformanceManager({
    enabled: true,
    mode: 'balanced',
    enableCaching: true,
    enableMemoryOptimization: true,
    enableStreamOptimization: true
  })

  return {
    deduplicationService,
    performanceManager
  }
}
