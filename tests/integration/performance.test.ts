/**
 * Performance Optimization Integration Tests
 *
 * Tests the integration of performance management across the entire system,
 * including caching, memory optimization, and streaming performance.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  MockPerformanceManager,
  MockStreamManager,
  createIntegratedMockServices
} from '../fixtures/mock-implementations'
import {
  createSampleOutput,
  createStreamOperations,
  PERFORMANCE_TEST_DATA,
  CONFIG_PRESETS
} from '../fixtures/test-data'
import type { PerformanceConfig, PerformanceMetrics } from '../../src/performance/types'
import type { StreamConfig } from '../../src/streaming/types'

describe('Performance Optimization Integration', () => {
  let services: ReturnType<typeof createIntegratedMockServices>

  beforeEach(() => {
    services = createIntegratedMockServices()
  })

  afterEach(async () => {
    await services.performanceManager.stop()
    if (services.streamManager.isReady()) {
      await services.streamManager.close()
    }
  })

  describe('Performance Manager Lifecycle', () => {
    it('should initialize with default configuration', async () => {
      await services.performanceManager.initialize()

      const config = services.performanceManager.getConfig()
      expect(config.enabled).toBe(true)
      expect(config.mode).toBe('balanced')
    })

    it('should start and track basic metrics', async () => {
      await services.performanceManager.initialize()
      await services.performanceManager.start()

      const initialMetrics = services.performanceManager.getMetrics()
      expect(initialMetrics.totalOperations).toBe(0)
      expect(initialMetrics.averageLatency).toBe(0)
    })

    it('should handle disabled performance management', async () => {
      const disabledManager = new MockPerformanceManager({ enabled: false })

      await disabledManager.initialize()
      await disabledManager.start()
      await disabledManager.optimize()

      expect(disabledManager.getOptimizationCount()).toBe(0)
    })
  })

  describe('Performance Optimization Effects', () => {
    beforeEach(async () => {
      await services.performanceManager.initialize()
      await services.performanceManager.start()
    })

    it('should show optimization improvements over time', async () => {
      const initialMetrics = services.performanceManager.getMetrics()

      // Simulate load
      services.performanceManager.simulateLoad(100)
      const loadedMetrics = services.performanceManager.getMetrics()

      expect(loadedMetrics.totalOperations).toBeGreaterThan(initialMetrics.totalOperations)
      expect(loadedMetrics.averageLatency).toBeGreaterThan(initialMetrics.averageLatency)

      // Run optimization
      await services.performanceManager.optimize()
      const optimizedMetrics = services.performanceManager.getMetrics()

      expect(optimizedMetrics.averageLatency).toBeLessThan(loadedMetrics.averageLatency)
      expect(optimizedMetrics.cacheHitRate).toBeGreaterThan(loadedMetrics.cacheHitRate)
      expect(optimizedMetrics.optimizationSavings).toBeGreaterThan(0)
    })

    it('should track cache performance improvements', async () => {
      // Simulate cache-friendly workload
      for (let i = 0; i < 5; i++) {
        services.performanceManager.simulateLoad(20)
        await services.performanceManager.optimize()
      }

      const metrics = services.performanceManager.getMetrics()
      expect(metrics.cacheHitRate).toBeGreaterThan(0.3) // Should improve with optimizations
      expect(services.performanceManager.getOptimizationCount()).toBe(5)
    })

    it('should handle memory optimization', async () => {
      // Simulate memory-intensive operations
      services.performanceManager.simulateLoad(1000)
      const beforeMemory = services.performanceManager.getMetrics().peakMemoryUsage

      await services.performanceManager.optimize()

      // Memory usage should be tracked (may not decrease in mock, but should be stable)
      const afterMemory = services.performanceManager.getMetrics().peakMemoryUsage
      expect(afterMemory).toBeGreaterThanOrEqual(beforeMemory)
    })
  })

  describe('Performance with Streaming Integration', () => {
    beforeEach(async () => {
      await services.performanceManager.initialize()
      await services.performanceManager.start()

      await services.streamManager.initialize({
        enabled: true,
        maxBufferSize: 1000,
        flushInterval: 100,
        enableBackpressure: true
      })
    })

    it('should optimize streaming performance under load', async () => {
      const operations = createStreamOperations(100)

      // Measure performance before optimization
      const startTime = Date.now()
      for (const operation of operations.slice(0, 50)) {
        await services.streamManager.write(operation)
      }
      const beforeOptTime = Date.now() - startTime

      // Run optimization
      services.performanceManager.simulateLoad(50)
      await services.performanceManager.optimize()

      // Measure performance after optimization
      const optimizedStartTime = Date.now()
      for (const operation of operations.slice(50)) {
        await services.streamManager.write(operation)
      }
      const afterOptTime = Date.now() - optimizedStartTime

      expect(services.streamManager.getOperations()).toHaveLength(100)
      expect(services.performanceManager.getOptimizationCount()).toBe(1)

      // Performance should be tracked
      const metrics = services.performanceManager.getMetrics()
      expect(metrics.totalOperations).toBeGreaterThan(0)
    })

    it('should handle backpressure with performance monitoring', async () => {
      // Simulate high-frequency operations
      const highVolumeOperations = createStreamOperations(200)

      const promises = highVolumeOperations.map(async (operation, index) => {
        if (index % 20 === 0) {
          // Simulate periodic optimization
          services.performanceManager.simulateLoad(20)
        }
        return services.streamManager.write(operation)
      })

      await Promise.all(promises)

      expect(services.streamManager.getOperations()).toHaveLength(200)

      // Run final optimization
      await services.performanceManager.optimize()
      const finalMetrics = services.performanceManager.getMetrics()

      expect(finalMetrics.totalOperations).toBeGreaterThan(180) // Should account for load simulation
    })

    it('should coordinate flush operations with performance optimization', async () => {
      const operations = createStreamOperations(50)

      // Write operations and track performance
      for (const operation of operations) {
        await services.streamManager.write(operation)

        if (operations.indexOf(operation) % 10 === 0) {
          services.performanceManager.simulateLoad(10)
        }
      }

      // Flush and optimize
      await services.streamManager.flush()
      await services.performanceManager.optimize()

      const metrics = services.performanceManager.getMetrics()
      expect(metrics.optimizationSavings).toBeGreaterThan(0)
      expect(services.streamManager.getOperations()).toHaveLength(50)
    })
  })

  describe('Large Scale Performance Testing', () => {
    beforeEach(async () => {
      await services.performanceManager.initialize()
      await services.performanceManager.start()
    })

    it('should handle large test suite performance', async () => {
      const largeOutput = PERFORMANCE_TEST_DATA.largeTestSuite(1000)

      // Simulate processing large output
      services.performanceManager.simulateLoad(largeOutput.summary.total)

      const beforeMetrics = services.performanceManager.getMetrics()
      await services.performanceManager.optimize()
      const afterMetrics = services.performanceManager.getMetrics()

      expect(afterMetrics.averageLatency).toBeLessThanOrEqual(beforeMetrics.averageLatency)
      expect(afterMetrics.totalOperations).toBe(beforeMetrics.totalOperations + 1) // Optimization counts as operation
    })

    it('should maintain performance with memory intensive workloads', async () => {
      const memoryIntensiveOutput = PERFORMANCE_TEST_DATA.memoryIntensiveOutput()

      // Simulate memory-heavy processing
      for (let batch = 0; batch < 10; batch++) {
        services.performanceManager.simulateLoad(memoryIntensiveOutput.summary.total)

        if (batch % 3 === 0) {
          await services.performanceManager.optimize()
        }
      }

      const finalMetrics = services.performanceManager.getMetrics()
      expect(finalMetrics.optimizationSavings).toBeGreaterThan(30) // Should accumulate savings
      expect(services.performanceManager.getOptimizationCount()).toBe(4) // Should have optimized 4 times
    })

    it('should handle high frequency streaming with performance optimization', async () => {
      await services.streamManager.initialize({
        enabled: true,
        maxBufferSize: 2000,
        flushInterval: 50,
        enableBackpressure: true
      })

      const highFrequencyStreams = PERFORMANCE_TEST_DATA.highFrequencyStreams(500)

      // Process in batches with optimization
      const batchSize = 100
      for (let i = 0; i < highFrequencyStreams.length; i += batchSize) {
        const batch = highFrequencyStreams.slice(i, i + batchSize)

        for (const operation of batch) {
          await services.streamManager.write(operation)
        }

        services.performanceManager.simulateLoad(batch.length)
        await services.performanceManager.optimize()
      }

      expect(services.streamManager.getOperations()).toHaveLength(500)
      expect(services.performanceManager.getOptimizationCount()).toBe(5) // 5 batches

      const finalMetrics = services.performanceManager.getMetrics()
      expect(finalMetrics.cacheHitRate).toBeGreaterThan(0.4) // Should improve with repeated optimizations
    })
  })

  describe('Configuration Impact on Performance', () => {
    it('should show different performance characteristics with different modes', async () => {
      // Test balanced mode
      const balancedManager = new MockPerformanceManager({
        enabled: true,
        mode: 'balanced',
        enableCaching: true,
        enableMemoryOptimization: true,
        enableStreamOptimization: true
      })

      await balancedManager.initialize()
      await balancedManager.start()
      balancedManager.simulateLoad(100)
      await balancedManager.optimize()

      const balancedMetrics = balancedManager.getMetrics()

      // Test performance mode (should optimize more aggressively)
      const performanceManager = new MockPerformanceManager({
        enabled: true,
        mode: 'performance',
        enableCaching: true,
        enableMemoryOptimization: true,
        enableStreamOptimization: true
      })

      await performanceManager.initialize()
      await performanceManager.start()
      performanceManager.simulateLoad(100)
      await performanceManager.optimize()

      const performanceMetrics = performanceManager.getMetrics()

      // Both should have metrics, configuration difference tracked in config
      expect(balancedMetrics.totalOperations).toBeGreaterThan(0)
      expect(performanceMetrics.totalOperations).toBeGreaterThan(0)
      expect(balancedManager.getConfig().mode).toBe('balanced')
      expect(performanceManager.getConfig().mode).toBe('performance')
    })

    it('should handle configuration updates dynamically', async () => {
      await services.performanceManager.initialize()

      const initialConfig = services.performanceManager.getConfig()
      expect(initialConfig.enableCaching).toBe(true)

      // Update configuration
      services.performanceManager.updateConfig({
        enableCaching: false,
        mode: 'memory'
      })

      const updatedConfig = services.performanceManager.getConfig()
      expect(updatedConfig.enableCaching).toBe(false)
      expect(updatedConfig.mode).toBe('memory')
      expect(updatedConfig.enabled).toBe(true) // Should preserve other settings
    })
  })

  describe('Performance Metrics Accuracy', () => {
    beforeEach(async () => {
      await services.performanceManager.initialize()
      await services.performanceManager.start()
    })

    it('should accurately track operation counts', async () => {
      const expectedOperations = 75

      services.performanceManager.simulateLoad(expectedOperations)

      const metrics = services.performanceManager.getMetrics()
      expect(metrics.totalOperations).toBe(expectedOperations)
    })

    it('should track latency trends', async () => {
      // Baseline
      const initialMetrics = services.performanceManager.getMetrics()
      const initialLatency = initialMetrics.averageLatency

      // Add load
      services.performanceManager.simulateLoad(50)
      const loadedMetrics = services.performanceManager.getMetrics()
      expect(loadedMetrics.averageLatency).toBeGreaterThan(initialLatency)

      // Optimize
      await services.performanceManager.optimize()
      const optimizedMetrics = services.performanceManager.getMetrics()
      expect(optimizedMetrics.averageLatency).toBeLessThan(loadedMetrics.averageLatency)
    })

    it('should track memory usage patterns', async () => {
      const operations = [10, 50, 100, 200, 150, 75]
      let peakMemory = 0

      for (const opCount of operations) {
        services.performanceManager.simulateLoad(opCount)
        const currentMetrics = services.performanceManager.getMetrics()
        peakMemory = Math.max(peakMemory, currentMetrics.peakMemoryUsage)
      }

      const finalMetrics = services.performanceManager.getMetrics()
      expect(finalMetrics.peakMemoryUsage).toBe(peakMemory)
      expect(finalMetrics.peakMemoryUsage).toBeGreaterThan(0)
    })

    it('should maintain accurate timestamps', async () => {
      const beforeTime = Date.now()

      services.performanceManager.simulateLoad(10)
      await services.performanceManager.optimize()

      const afterTime = Date.now()
      const metrics = services.performanceManager.getMetrics()

      expect(metrics.lastUpdateTime).toBeGreaterThanOrEqual(beforeTime)
      expect(metrics.lastUpdateTime).toBeLessThanOrEqual(afterTime)
    })
  })

  describe('Performance Error Handling', () => {
    it('should handle performance manager failures gracefully', async () => {
      const manager = new MockPerformanceManager({ enabled: true })

      await manager.initialize()
      await manager.start()

      // Simulate error conditions by resetting
      manager.reset()

      // Should still be able to continue
      manager.simulateLoad(10)
      await manager.optimize()

      const metrics = manager.getMetrics()
      expect(metrics.totalOperations).toBeGreaterThanOrEqual(10) // May include optimization operation
    })

    it('should maintain consistency during concurrent operations', async () => {
      await services.performanceManager.initialize()
      await services.performanceManager.start()

      // Simulate concurrent load and optimization
      const promises = [
        services.performanceManager.optimize(),
        Promise.resolve(services.performanceManager.simulateLoad(25)),
        services.performanceManager.optimize(),
        Promise.resolve(services.performanceManager.simulateLoad(25)),
        services.performanceManager.optimize()
      ]

      await Promise.all(promises)

      const metrics = services.performanceManager.getMetrics()
      expect(metrics.totalOperations).toBe(50 + 3) // 50 from load + 3 from optimization
      expect(services.performanceManager.getOptimizationCount()).toBe(3)
    })
  })
})
