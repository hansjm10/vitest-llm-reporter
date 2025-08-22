/**
 * Tests for MetricsCollector
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { MetricsCollector } from './MetricsCollector'
import type { PerformanceConfig } from './types'

// Mock the logger utilities
vi.mock('../utils/logger', () => ({
  coreLogger: vi.fn(() => vi.fn()),
  errorLogger: vi.fn(() => vi.fn())
}))

// Mock process.memoryUsage
const mockMemoryUsage = vi.fn()
Object.defineProperty(process, 'memoryUsage', {
  value: mockMemoryUsage,
  writable: true
})

describe('MetricsCollector', () => {
  let collector: MetricsCollector
  let config: Required<PerformanceConfig>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // Set up default memory usage mock
    mockMemoryUsage.mockReturnValue({
      rss: 100 * 1024 * 1024, // 100MB
      heapTotal: 80 * 1024 * 1024, // 80MB
      heapUsed: 40 * 1024 * 1024, // 40MB
      external: 10 * 1024 * 1024, // 10MB
      arrayBuffers: 5 * 1024 * 1024 // 5MB
    })

    config = {
      mode: 'production',
      enabled: true,
      maxOverheadPercent: 5,
      enableMetrics: true,
      enableCaching: true,
      enableMemoryManagement: true,
      enableStreamingOptimizations: true,
      cache: {
        enabled: true,
        tokenCacheSize: 1000,
        resultCacheSize: 500,
        templateCacheSize: 100,
        ttl: 3600000,
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

    collector = new MetricsCollector(config)
  })

  afterEach(() => {
    collector.stop()
    vi.useRealTimers()
  })

  describe('constructor', () => {
    it('should create metrics collector with config', () => {
      expect(collector).toBeDefined()
    })

    it('should initialize with stopped state', () => {
      expect(collector['isCollecting']).toBe(false)
    })
  })

  describe('start and stop', () => {
    it('should start collecting metrics', () => {
      collector.start()
      expect(collector['isCollecting']).toBe(true)
    })

    it('should stop collecting metrics', () => {
      collector.start()
      collector.stop()
      expect(collector['isCollecting']).toBe(false)
    })

    it('should not start if already collecting', () => {
      collector.start()
      const startTime = collector['throughputCounters'].startTime

      vi.advanceTimersByTime(1000)
      collector.start() // Second call

      expect(collector['throughputCounters'].startTime).toBe(startTime)
    })

    it('should not stop if not collecting', () => {
      collector.stop() // Should not throw
      expect(collector['isCollecting']).toBe(false)
    })

    it('should start memory monitoring when enabled', () => {
      const memoryConfig = { ...config, memory: { ...config.memory, enabled: true } }
      const memoryCollector = new MetricsCollector(memoryConfig)

      memoryCollector.start()
      expect(memoryCollector['isCollecting']).toBe(true)
    })
  })

  describe('collect', () => {
    beforeEach(() => {
      collector.start()
    })

    it('should collect current metrics', () => {
      const metrics = collector.collect()

      expect(metrics).toBeDefined()
      expect(metrics.timing).toBeDefined()
      expect(metrics.memory).toBeDefined()
      expect(metrics.cache).toBeDefined()
      expect(metrics.throughput).toBeDefined()
      expect(metrics.overhead).toBeDefined()
      expect(metrics.timestamp).toBeGreaterThan(0)
    })

    it('should add metrics to history when collecting', () => {
      const initialHistory = collector.getHistory()
      expect(initialHistory).toHaveLength(0)

      collector.collect()
      const updatedHistory = collector.getHistory()
      expect(updatedHistory).toHaveLength(1)
    })

    it('should not add to history when not collecting', () => {
      collector.stop()
      collector.collect()

      const history = collector.getHistory()
      expect(history).toHaveLength(0)
    })

    it('should limit history size to prevent memory leaks', () => {
      // Start collecting to actually add to history
      collector.start()

      // Mock a large number of collections
      for (let i = 0; i < 1200; i++) {
        collector.collect()
      }

      const history = collector.getHistory()
      expect(history.length).toBeLessThanOrEqual(500)
    })

    it('should handle collection errors gracefully', () => {
      mockMemoryUsage.mockImplementationOnce(() => {
        throw new Error('Memory usage failed')
      })

      const metrics = collector.collect()

      expect(metrics).toBeDefined()
      expect(metrics.timing.totalTime).toBe(0)
    })
  })

  describe('timing operations', () => {
    it('should start and end timing operations', () => {
      const timingId = collector.startTiming('test_operation')
      expect(timingId).toBeDefined()
      expect(typeof timingId).toBe('string')

      vi.advanceTimersByTime(100)
      const duration = collector.endTiming(timingId)
      expect(duration).toBeGreaterThanOrEqual(100)
    })

    it('should track multiple timing operations', () => {
      const id1 = collector.startTiming('operation1')
      const id2 = collector.startTiming('operation2')

      vi.advanceTimersByTime(50)
      const duration1 = collector.endTiming(id1)

      vi.advanceTimersByTime(50)
      const duration2 = collector.endTiming(id2)

      expect(duration1).toBeGreaterThanOrEqual(50)
      expect(duration2).toBeGreaterThanOrEqual(100)
    })

    it('should handle ending non-existent timing operation', () => {
      const duration = collector.endTiming('nonexistent')
      expect(duration).toBe(0)
    })

    it('should update overhead tracking based on operation type', () => {
      // First create some baseline time for overhead calculation
      const baselineId = collector.startTiming('test_processing')
      vi.advanceTimersByTime(50)
      collector.endTiming(baselineId)

      // Now track overhead operations
      const performanceId = collector.startTiming('performance_test')
      const cacheId = collector.startTiming('cache_operation')

      vi.advanceTimersByTime(100)
      collector.endTiming(performanceId)
      collector.endTiming(cacheId)

      const metrics = collector.collect()
      expect(metrics.overhead.totalOverhead).toBeGreaterThan(0)
    })
  })

  describe('cache operations', () => {
    it('should record cache hit operations', () => {
      collector.recordCacheOperation('token', 'hit', 5)

      const metrics = collector.collect()
      expect(metrics.cache.hits).toBe(1)
    })

    it('should record cache miss operations', () => {
      collector.recordCacheOperation('token', 'miss', 10)

      const metrics = collector.collect()
      expect(metrics.cache.misses).toBe(1)
    })

    it('should track operations per cache type', () => {
      collector.recordCacheOperation('token', 'hit', 5)
      collector.recordCacheOperation('result', 'miss', 8)
      collector.recordCacheOperation('template', 'hit', 3)

      const metrics = collector.collect()
      expect(metrics.cache.caches.tokenCache.hitRatio).toBeGreaterThan(0)
    })

    it('should limit cache operations history', () => {
      // Add many cache operations
      for (let i = 0; i < 12000; i++) {
        collector.recordCacheOperation('token', 'hit', 1)
      }

      const cacheOps = collector['cacheOperations']
      expect(cacheOps.length).toBeLessThanOrEqual(5000)
    })

    it('should calculate hit ratios correctly', () => {
      collector.recordCacheOperation('token', 'hit', 1)
      collector.recordCacheOperation('token', 'hit', 1)
      collector.recordCacheOperation('token', 'miss', 1)

      const metrics = collector.collect()
      expect(metrics.cache.hitRatio).toBeCloseTo(66.67, 1) // 2 hits out of 3 total
    })
  })

  describe('test and operation recording', () => {
    it('should record test processing', () => {
      // Advance time so throughput calculation works
      vi.advanceTimersByTime(1000)

      collector.recordTestProcessed(1024)

      const metrics = collector.collect()
      expect(metrics.throughput.testsPerSecond).toBeGreaterThan(0)
      expect(metrics.throughput.bytesPerSecond).toBeGreaterThan(0)
    })

    it('should record general operations', () => {
      // Advance time so throughput calculation works
      vi.advanceTimersByTime(1000)

      collector.recordOperation(2048)

      const metrics = collector.collect()
      expect(metrics.throughput.operationsPerSecond).toBeGreaterThan(0)
    })

    it('should calculate throughput correctly', () => {
      collector.start()
      collector.recordTestProcessed(1000)
      collector.recordOperation(500)

      vi.advanceTimersByTime(2000) // 2 seconds

      const metrics = collector.collect()
      expect(metrics.throughput.testsPerSecond).toBeCloseTo(0.5, 1) // 1 test in 2 seconds
      expect(metrics.throughput.operationsPerSecond).toBeCloseTo(1, 1) // 2 operations in 2 seconds
    })
  })

  describe('memory metrics', () => {
    it('should collect memory metrics', () => {
      const metrics = collector.collect()

      expect(metrics.memory.currentUsage).toBe(40 * 1024 * 1024) // 40MB as mocked
      expect(metrics.memory.peakUsage).toBeGreaterThan(0)
      expect(metrics.memory.usagePercentage).toBeGreaterThan(0)
      expect(metrics.memory.pressureLevel).toBeDefined()
    })

    it('should calculate memory pressure levels correctly', () => {
      // Test low pressure
      mockMemoryUsage.mockReturnValueOnce({
        heapTotal: 100 * 1024 * 1024,
        heapUsed: 30 * 1024 * 1024, // 30% usage
        external: 0,
        rss: 0,
        arrayBuffers: 0
      })

      let metrics = collector.collect()
      expect(metrics.memory.pressureLevel).toBe('low')

      // Test high pressure
      mockMemoryUsage.mockReturnValueOnce({
        heapTotal: 100 * 1024 * 1024,
        heapUsed: 85 * 1024 * 1024, // 85% usage
        external: 0,
        rss: 0,
        arrayBuffers: 0
      })

      metrics = collector.collect()
      expect(metrics.memory.pressureLevel).toBe('high')

      // Test critical pressure
      mockMemoryUsage.mockReturnValueOnce({
        heapTotal: 100 * 1024 * 1024,
        heapUsed: 95 * 1024 * 1024, // 95% usage
        external: 0,
        rss: 0,
        arrayBuffers: 0
      })

      metrics = collector.collect()
      expect(metrics.memory.pressureLevel).toBe('critical')
    })

    it('should track peak memory usage', () => {
      // First collection with lower usage
      mockMemoryUsage.mockReturnValueOnce({
        heapTotal: 100 * 1024 * 1024,
        heapUsed: 30 * 1024 * 1024,
        external: 0,
        rss: 0,
        arrayBuffers: 0
      })

      let metrics = collector.collect()
      const firstPeak = metrics.memory.peakUsage

      // Second collection with higher usage
      mockMemoryUsage.mockReturnValueOnce({
        heapTotal: 100 * 1024 * 1024,
        heapUsed: 50 * 1024 * 1024,
        external: 0,
        rss: 0,
        arrayBuffers: 0
      })

      metrics = collector.collect()
      expect(metrics.memory.peakUsage).toBeGreaterThan(firstPeak)
    })

    it('should handle memory collection errors', () => {
      mockMemoryUsage.mockImplementationOnce(() => {
        throw new Error('Memory access failed')
      })

      const metrics = collector.collect()
      expect(metrics.memory.currentUsage).toBe(0)
      expect(metrics.memory.pressureLevel).toBe('low')
    })
  })

  describe('timing metrics', () => {
    it('should calculate timing metrics from operations', () => {
      collector.recordCacheOperation('token', 'hit', 5)
      collector.recordCacheOperation('result', 'miss', 10)

      const metrics = collector.collect()

      expect(metrics.timing.cacheLookupTime).toBe(15) // 5 + 10
      expect(metrics.timing.averageLatency).toBe(7.5) // (5 + 10) / 2
    })

    it('should calculate percentile latencies', () => {
      // Add multiple operations with different durations
      const durations = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      durations.forEach((duration) => {
        collector.recordCacheOperation('token', 'hit', duration)
      })

      const metrics = collector.collect()

      expect(metrics.timing.p95Latency).toBeGreaterThan(0)
      expect(metrics.timing.p99Latency).toBeGreaterThan(0)
      expect(metrics.timing.p99Latency).toBeGreaterThanOrEqual(metrics.timing.p95Latency)
    })

    it('should handle empty timing data', () => {
      const metrics = collector.collect()

      expect(metrics.timing.averageLatency).toBe(0)
      expect(metrics.timing.p95Latency).toBe(0)
      expect(metrics.timing.p99Latency).toBe(0)
    })
  })

  describe('overhead metrics', () => {
    it('should calculate overhead percentages', () => {
      // Record baseline operation
      const baselineId = collector.startTiming('baseline_operation')
      vi.advanceTimersByTime(100)
      collector.endTiming(baselineId)

      // Record performance overhead
      const perfId = collector.startTiming('performance_overhead')
      vi.advanceTimersByTime(10)
      collector.endTiming(perfId)

      const metrics = collector.collect()
      expect(metrics.overhead.performanceOverhead).toBeGreaterThan(0)
      expect(metrics.overhead.totalOverhead).toBeGreaterThan(0)
    })

    it('should categorize overhead by operation type', () => {
      collector.startTiming('cache_operation')
      vi.advanceTimersByTime(50)
      collector.endTiming(collector.startTiming('cache_operation'))

      collector.startTiming('memory_operation')
      vi.advanceTimersByTime(30)
      collector.endTiming(collector.startTiming('memory_operation'))

      collector.startTiming('baseline')
      vi.advanceTimersByTime(100)
      collector.endTiming(collector.startTiming('baseline'))

      const metrics = collector.collect()
      expect(metrics.overhead.cacheOverhead).toBeGreaterThanOrEqual(0)
      expect(metrics.overhead.memoryOverhead).toBeGreaterThanOrEqual(0)
    })

    it('should handle zero baseline time', () => {
      const metrics = collector.collect()

      expect(metrics.overhead.performanceOverhead).toBe(0)
      expect(metrics.overhead.totalOverhead).toBe(0)
    })
  })

  describe('cache capacity calculation', () => {
    it('should return correct cache capacities', () => {
      const tokenCapacity = collector['getCacheCapacity']('token')
      const resultCapacity = collector['getCacheCapacity']('result')
      const templateCapacity = collector['getCacheCapacity']('template')
      const unknownCapacity = collector['getCacheCapacity']('unknown')

      expect(tokenCapacity).toBe(1000)
      expect(resultCapacity).toBe(500)
      expect(templateCapacity).toBe(100)
      expect(unknownCapacity).toBe(1000) // default
    })
  })

  describe('history management', () => {
    beforeEach(() => {
      collector.start()
    })

    it('should maintain metrics history', () => {
      collector.collect()
      collector.collect()
      collector.collect()

      const history = collector.getHistory()
      expect(history).toHaveLength(3)
    })

    it('should clear history and reset counters', () => {
      collector.collect()
      collector.recordTestProcessed(1000)
      collector.recordCacheOperation('token', 'hit', 5)

      collector.clearHistory()

      const history = collector.getHistory()
      expect(history).toHaveLength(0)

      const metrics = collector.collect()
      expect(metrics.throughput.testsPerSecond).toBe(0)
    })

    it('should return metrics without internal ID', () => {
      collector.collect()
      const history = collector.getHistory()

      expect(history[0]).not.toHaveProperty('id')
      expect(history[0]).toHaveProperty('timestamp')
    })
  })

  describe('memory monitoring', () => {
    it('should monitor memory periodically when started', () => {
      const memoryCollector = new MetricsCollector({
        ...config,
        memory: { ...config.memory, enabled: true, monitoringInterval: 100 }
      })

      memoryCollector.start()

      vi.advanceTimersByTime(250) // Should trigger 2 monitoring cycles

      const snapshots = memoryCollector['memorySnapshots']
      expect(snapshots.length).toBeGreaterThan(0)
    })

    it('should limit memory snapshots to prevent memory leaks', () => {
      const memoryCollector = new MetricsCollector({
        ...config,
        memory: { ...config.memory, enabled: true, monitoringInterval: 1 }
      })

      memoryCollector.start()

      // Simulate many monitoring cycles
      for (let i = 0; i < 1200; i++) {
        memoryCollector['memorySnapshots'].push({
          timestamp: Date.now(),
          usage: 1024,
          heapUsed: 1024,
          heapTotal: 2048,
          external: 0
        })
      }

      vi.advanceTimersByTime(10) // Trigger cleanup

      const snapshots = memoryCollector['memorySnapshots']
      expect(snapshots.length).toBeLessThanOrEqual(500)
    })

    it('should handle memory monitoring errors', () => {
      mockMemoryUsage.mockImplementationOnce(() => {
        throw new Error('Memory monitoring failed')
      })

      const memoryCollector = new MetricsCollector({
        ...config,
        memory: { ...config.memory, enabled: true, monitoringInterval: 10 }
      })

      memoryCollector.start()
      vi.advanceTimersByTime(50)

      // Should not throw and continue monitoring
      expect(memoryCollector['isCollecting']).toBe(true)
    })

    it('should stop monitoring when collection stops', () => {
      const memoryCollector = new MetricsCollector({
        ...config,
        memory: { ...config.memory, enabled: true, monitoringInterval: 100 }
      })

      memoryCollector.start()
      memoryCollector.stop()

      const initialSnapshots = memoryCollector['memorySnapshots'].length
      vi.advanceTimersByTime(500)

      // Should not add more snapshots after stopping
      expect(memoryCollector['memorySnapshots'].length).toBe(initialSnapshots)
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle zero elapsed time in throughput calculation', () => {
      collector.start()

      // Collect immediately without advancing time
      const metrics = collector.collect()

      expect(metrics.throughput.testsPerSecond).toBe(0)
      expect(metrics.throughput.operationsPerSecond).toBe(0)
    })

    it('should handle missing cache configuration', () => {
      const minimalConfig = {
        ...config,
        cache: undefined as any
      }

      const minimalCollector = new MetricsCollector(minimalConfig)
      const metrics = minimalCollector.collect()

      expect(metrics.cache).toBeDefined()
    })

    it('should handle operations with recent time window filtering', () => {
      collector.recordCacheOperation('token', 'hit', 5)

      // Advance time beyond the recent window (5 minutes)
      vi.advanceTimersByTime(6 * 60 * 1000)

      // Add new operation
      collector.recordCacheOperation('token', 'hit', 3)

      const metrics = collector.collect()
      // Should only count recent operations
      expect(metrics.cache.hits).toBe(1)
    })
  })
})
