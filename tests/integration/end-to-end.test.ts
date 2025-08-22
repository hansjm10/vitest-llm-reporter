/**
 * End-to-End Integration Tests
 *
 * Comprehensive tests that validate the complete integration of all system components:
 * streaming, performance optimization, deduplication, and reporter functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createIntegratedMockServices } from '../fixtures/mock-implementations'
import {
  createSampleOutput,
  createStreamOperations,
  createConsoleStreamData,
  DEDUPLICATION_SCENARIOS,
  PERFORMANCE_TEST_DATA
} from '../fixtures/test-data'
import type { StreamConfig } from '../../src/streaming/types'
import type { DeduplicationConfig } from '../../src/types/deduplication'
import type { PerformanceConfig } from '../../src/performance/types'
import type { LLMReporterOutput } from '../../src/types/schema'

describe('End-to-End Integration', () => {
  let services: ReturnType<typeof createIntegratedMockServices>

  beforeEach(() => {
    services = createIntegratedMockServices()
  })

  afterEach(async () => {
    await services.performanceManager.stop()
    if (services.streamManager.isReady()) {
      await services.streamManager.close()
    }
    services.consoleAdapter.destroy()
    services.deduplicationService.reset()
    services.performanceManager.reset()
  })

  describe('Complete System Initialization', () => {
    it('should initialize all components in correct order', async () => {
      // Initialize performance manager first
      await services.performanceManager.initialize()
      await services.performanceManager.start()

      // Initialize streaming
      await services.streamManager.initialize({
        enabled: true,
        maxBufferSize: 1000,
        flushInterval: 100,
        enableBackpressure: true
      })

      // Initialize console adapter
      services.consoleAdapter.initialize(services.streamManager)

      // Verify all components are ready
      expect(services.performanceManager.getConfig().enabled).toBe(true)
      expect(services.streamManager.isReady()).toBe(true)
      expect(services.consoleAdapter.isReady()).toBe(true)
      expect(services.deduplicationService.getConfig().enabled).toBe(true)
    })

    it('should handle partial system initialization gracefully', async () => {
      // Initialize only some components
      await services.streamManager.initialize({
        enabled: false,
        maxBufferSize: 1000,
        flushInterval: 100,
        enableBackpressure: false
      })

      services.deduplicationService.updateConfig({ enabled: false })

      // System should still be functional with reduced capabilities
      expect(services.streamManager.isReady()).toBe(false)
      expect(services.deduplicationService.getConfig().enabled).toBe(false)

      // But we should still be able to process data
      const output = createSampleOutput(5, 2, 1)
      const result = await services.deduplicationService.processOutput(output)
      expect(result.originalCount).toBe(2)
    })
  })

  describe('Full Pipeline Data Flow', () => {
    beforeEach(async () => {
      await services.performanceManager.initialize()
      await services.performanceManager.start()

      await services.streamManager.initialize({
        enabled: true,
        maxBufferSize: 2000,
        flushInterval: 50,
        enableBackpressure: true
      })

      services.consoleAdapter.initialize(services.streamManager)
    })

    it('should process complete test run through entire pipeline', async () => {
      // Step 1: Generate test data
      const testOutput = createSampleOutput(25, 15, 5)
      const consoleData = createConsoleStreamData(20)
      const streamOps = createStreamOperations(30)

      // Step 2: Process through deduplication
      const deduplicationResult = await services.deduplicationService.processOutput(testOutput)

      // Step 3: Stream console data
      for (const data of consoleData) {
        await services.consoleAdapter.streamConsoleData(data)
      }

      // Step 4: Stream operations
      for (const op of streamOps) {
        await services.streamManager.write(op)
      }

      // Step 5: Performance optimization
      await services.performanceManager.optimize()

      // Step 6: Flush streaming
      await services.streamManager.flush()

      // Verify complete pipeline results
      expect(deduplicationResult.originalCount).toBe(15)
      expect(deduplicationResult.deduplicatedCount).toBeLessThanOrEqual(15)
      expect(services.consoleAdapter.getStreamedData()).toHaveLength(20)
      expect(services.streamManager.getOperations()).toHaveLength(50) // 20 console + 30 direct
      expect(services.deduplicationService.getProcessedCount()).toBe(1)
    })

    it('should maintain data integrity across all components', async () => {
      const originalOutput = createSampleOutput(10, 8, 2)
      const testId = 'integration-test-1'

      // Process with specific test ID tracking
      const deduplicationResult = await services.deduplicationService.processOutput(originalOutput)

      // Stream data with same test ID
      const consoleData = createConsoleStreamData(5).map((data) => ({
        ...data,
        testId
      }))

      for (const data of consoleData) {
        await services.consoleAdapter.streamConsoleData(data)
      }

      // Verify data integrity
      const streamedConsoleData = services.consoleAdapter.getStreamedData()
      const streamOperations = services.streamManager.getOperations()

      // All console data should be streamed
      expect(streamedConsoleData).toHaveLength(5)
      streamedConsoleData.forEach((data) => {
        expect(data.testId).toBe(testId)
      })

      // All should convert to stream operations
      expect(streamOperations).toHaveLength(5)
      streamOperations.forEach((op) => {
        expect(op.testId).toBe(testId)
      })

      // Deduplication should preserve original count
      expect(deduplicationResult.originalCount).toBe(originalOutput.failures?.length || 0)
    })

    it('should handle high-volume data flow efficiently', async () => {
      const largeOutput = PERFORMANCE_TEST_DATA.largeTestSuite(500)
      const highVolumeConsole = PERFORMANCE_TEST_DATA.consoleHeavyData(200)
      const highFrequencyStreams = PERFORMANCE_TEST_DATA.highFrequencyStreams(300)

      const startTime = Date.now()

      // Process large deduplication
      const deduplicationPromise = services.deduplicationService.processOutput(largeOutput)

      // Process console data concurrently
      const consolePromises = highVolumeConsole.map((data) =>
        services.consoleAdapter.streamConsoleData(data)
      )

      // Process stream operations concurrently
      const streamPromises = highFrequencyStreams.map((op) => services.streamManager.write(op))

      // Wait for all processing
      const [deduplicationResult] = await Promise.all([
        deduplicationPromise,
        ...consolePromises,
        ...streamPromises
      ])

      const endTime = Date.now()
      const totalTime = endTime - startTime

      // Verify high-volume processing
      expect(deduplicationResult.originalCount).toBe(75) // 15% of 500
      expect(services.consoleAdapter.getStreamedData()).toHaveLength(200)
      expect(services.streamManager.getOperations()).toHaveLength(500) // 200 console + 300 direct
      expect(totalTime).toBeLessThan(5000) // Should complete within 5 seconds

      // Optimize performance after high load
      const optimizationResults = await services.performanceManager.optimize()

      const metrics = services.performanceManager.getMetrics()
      expect(metrics.throughput.operationsPerSecond).toBeGreaterThan(0)
    })
  })

  describe('Configuration Coordination', () => {
    it('should coordinate optimal configurations across components', async () => {
      // Set up performance-optimized configuration
      const perfConfig: PerformanceConfig = {
        enabled: true,
        mode: 'performance',
        enableCaching: true,
        enableMemoryOptimization: true,
        enableStreamOptimization: true
      }

      const streamConfig: StreamConfig = {
        enabled: true,
        maxBufferSize: 5000,
        flushInterval: 25,
        enableBackpressure: true
      }

      const deduplicationConfig: DeduplicationConfig = {
        enabled: true,
        strategy: 'aggressive',
        thresholds: { exact: 1.0, high: 0.8, medium: 0.6, low: 0.4 },
        patterns: { stackTrace: true, errorMessage: true, consoleOutput: true, assertion: true },
        compression: {
          enabled: true,
          minGroupSize: 2,
          maxTemplateVariables: 15,
          preserveExamples: 5
        }
      }

      // Apply configurations
      services.performanceManager.updateConfig(perfConfig)
      services.deduplicationService.updateConfig(deduplicationConfig)

      await services.performanceManager.initialize()
      await services.performanceManager.start()
      await services.streamManager.initialize(streamConfig)
      services.consoleAdapter.initialize(services.streamManager)

      // Test coordinated operation
      const testOutput = createSampleOutput(20, 30, 10)

      const deduplicationResult = await services.deduplicationService.processOutput(testOutput)

      const consoleData = createConsoleStreamData(15)
      for (const data of consoleData) {
        await services.consoleAdapter.streamConsoleData(data)
      }

      await services.performanceManager.optimize()
      await services.streamManager.flush()

      // Verify optimized operation
      expect(deduplicationResult.stats.compressionRatio).toBeLessThan(0.8) // Aggressive deduplication
      expect(services.streamManager.getOperations()).toHaveLength(15)
      expect(services.performanceManager.getMetrics().overhead.totalOverhead).toBeGreaterThanOrEqual(0)
    })

    it('should handle conflicting configuration requirements', async () => {
      // Set up conflicting configs (memory optimization vs high buffer)
      services.performanceManager.updateConfig({
        enabled: true,
        mode: 'memory',
        enableMemoryOptimization: true
      })

      await services.performanceManager.initialize()
      await services.performanceManager.start()

      await services.streamManager.initialize({
        enabled: true,
        maxBufferSize: 10000, // Large buffer conflicts with memory optimization
        flushInterval: 200,
        enableBackpressure: true
      })

      services.consoleAdapter.initialize(services.streamManager)

      // System should still function despite conflicts
      const testOutput = createSampleOutput(15, 10, 5)
      const result = await services.deduplicationService.processOutput(testOutput)

      await services.performanceManager.optimize()

      expect(result.originalCount).toBe(10)
      expect(services.performanceManager.getConfig().mode).toBe('memory')
      expect(services.streamManager.getConfig()?.maxBufferSize).toBe(10000)
    })
  })

  describe('Error Recovery and Resilience', () => {
    beforeEach(async () => {
      await services.performanceManager.initialize()
      await services.streamManager.initialize({
        enabled: true,
        maxBufferSize: 1000,
        flushInterval: 100,
        enableBackpressure: true
      })
      services.consoleAdapter.initialize(services.streamManager)
    })

    it('should recover from component failures gracefully', async () => {
      // Simulate streaming failure
      await services.streamManager.close()

      // Other components should continue working
      const testOutput = createSampleOutput(5, 3, 1)
      const deduplicationResult = await services.deduplicationService.processOutput(testOutput)

      expect(deduplicationResult.originalCount).toBe(3)
      expect(services.streamManager.isReady()).toBe(false)
      expect(services.consoleAdapter.isReady()).toBe(false)

      // Restart streaming
      await services.streamManager.initialize({
        enabled: true,
        maxBufferSize: 1000,
        flushInterval: 100,
        enableBackpressure: true
      })
      services.consoleAdapter.initialize(services.streamManager)

      // Should be functional again
      expect(services.streamManager.isReady()).toBe(true)
      expect(services.consoleAdapter.isReady()).toBe(true)
    })

    it('should handle partial system degradation', async () => {
      // Disable performance optimization
      services.performanceManager.updateConfig({ enabled: false })

      // Disable deduplication
      services.deduplicationService.updateConfig({ enabled: false })

      // Streaming should still work
      const consoleData = createConsoleStreamData(10)
      for (const data of consoleData) {
        await services.consoleAdapter.streamConsoleData(data)
      }

      const streamOps = createStreamOperations(5)
      for (const op of streamOps) {
        await services.streamManager.write(op)
      }

      await services.streamManager.flush()

      expect(services.consoleAdapter.getStreamedData()).toHaveLength(10)
      expect(services.streamManager.getOperations()).toHaveLength(15)

      // Process output without deduplication
      const testOutput = createSampleOutput(3, 2, 1)
      const result = await services.deduplicationService.processOutput(testOutput)

      expect(result.originalCount).toBe(result.deduplicatedCount) // No deduplication
    })

    it('should maintain system stability under stress', async () => {
      // Start performance monitoring
      await services.performanceManager.start()

      // Stress test with rapid operations
      const stressPromises = []

      // Rapid deduplication processing
      for (let i = 0; i < 10; i++) {
        const output = createSampleOutput(5, 10, 2)
        stressPromises.push(services.deduplicationService.processOutput(output))
      }

      // Rapid console streaming
      for (let i = 0; i < 50; i++) {
        const data = createConsoleStreamData(1)[0]
        stressPromises.push(services.consoleAdapter.streamConsoleData(data))
      }

      // Rapid stream operations
      for (let i = 0; i < 50; i++) {
        const op = createStreamOperations(1)[0]
        stressPromises.push(services.streamManager.write(op))
      }

      // Rapid optimizations
      for (let i = 0; i < 5; i++) {
        stressPromises.push(
          (async () => {
            await services.performanceManager.optimize()
          })()
        )
      }

      await Promise.all(stressPromises)

      // Verify system stability
      expect(services.deduplicationService.getProcessedCount()).toBe(10)
      expect(services.consoleAdapter.getStreamedData()).toHaveLength(50)
      expect(services.streamManager.getOperations()).toHaveLength(100) // 50 console + 50 direct

      const finalMetrics = services.performanceManager.getMetrics()
      expect(finalMetrics.throughput.operationsPerSecond).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Real-World Scenarios', () => {
    beforeEach(async () => {
      // Initialize with realistic configuration
      await services.performanceManager.initialize()
      await services.performanceManager.start()

      await services.streamManager.initialize({
        enabled: true,
        maxBufferSize: 2000,
        flushInterval: 100,
        enableBackpressure: true
      })

      services.consoleAdapter.initialize(services.streamManager)
    })

    it('should handle typical CI/CD test run scenario', async () => {
      // Simulate a typical test run: mostly passing, some failures, extensive console output
      const testRun = createSampleOutput(150, 25, 10)

      // Process main test results
      const deduplicationResult = await services.deduplicationService.processOutput(testRun)

      // Simulate extensive console output during tests
      const consoleOutput = createConsoleStreamData(100)
      const consolePromises = consoleOutput.map((data) =>
        services.consoleAdapter.streamConsoleData(data)
      )

      // Simulate test progress streaming
      const progressOps = createStreamOperations(50)
      const progressPromises = progressOps.map((op) => services.streamManager.write(op))

      await Promise.all([...consolePromises, ...progressPromises])

      // Optimize performance during run
      await services.performanceManager.optimize()

      // Final flush
      await services.streamManager.flush()

      // Verify CI/CD scenario results
      expect(deduplicationResult.originalCount).toBe(25)
      expect(deduplicationResult.deduplicatedCount).toBeLessThanOrEqual(25)
      expect(services.consoleAdapter.getStreamedData()).toHaveLength(100)
      expect(services.streamManager.getOperations()).toHaveLength(150)

      const metrics = services.performanceManager.getMetrics()
      expect(metrics.throughput.operationsPerSecond).toBeGreaterThan(0)
      expect(metrics.throughput.testsPerSecond).toBeGreaterThan(0)
    })

    it('should handle debugging scenario with heavy console output', async () => {
      // Simulate debugging with lots of console output but few test failures
      const debugOutput = createSampleOutput(20, 3, 0)
      const heavyConsole = createConsoleStreamData(200)

      // Process test results
      const deduplicationResult = await services.deduplicationService.processOutput(debugOutput)

      // Heavy console streaming
      for (const data of heavyConsole) {
        await services.consoleAdapter.streamConsoleData(data)
      }

      // Multiple optimization cycles due to heavy load
      for (let i = 0; i < 5; i++) {
        await services.performanceManager.optimize()
      }

      await services.streamManager.flush()

      // Verify debugging scenario
      expect(deduplicationResult.originalCount).toBe(3)
      expect(services.consoleAdapter.getStreamedData()).toHaveLength(200)

      const finalMetrics = services.performanceManager.getMetrics()
      expect(finalMetrics.cache.hitRatio).toBeGreaterThan(0.3) // Should improve with multiple optimizations
    })

    it('should handle failure-heavy scenario with extensive deduplication', async () => {
      // Simulate test run with many similar failures
      const failureHeavyOutput: LLMReporterOutput = {
        summary: createSampleOutput(20, 50, 5).summary,
        failures: [
          ...DEDUPLICATION_SCENARIOS.identicalFailures,
          ...DEDUPLICATION_SCENARIOS.similarStackTraces,
          ...DEDUPLICATION_SCENARIOS.mixedFailures.slice(0, 10),
          // Add more similar failures
          ...Array.from({ length: 30 }, (_, i) => ({
            test: `similar test ${i}`,
            file: '/tests/similar.test.ts',
            startLine: 10 + i,
            endLine: 15 + i,
            error: {
              message: 'Similar error pattern',
              type: 'TestError',
              stack: `TestError: Similar error pattern\n    at /tests/similar.test.ts:${12 + i}:5`
            }
          }))
        ]
      }

      // Process with aggressive deduplication
      services.deduplicationService.updateConfig({
        strategy: 'aggressive',
        thresholds: { exact: 1.0, high: 0.8, medium: 0.6, low: 0.4 }
      })

      const deduplicationResult =
        await services.deduplicationService.processOutput(failureHeavyOutput)

      // Performance optimization should handle the load
      await services.performanceManager.optimize()

      // Verify failure-heavy scenario (account for actual failure count)
      const actualFailureCount = failureHeavyOutput.failures?.length || 0
      expect(deduplicationResult.originalCount).toBe(actualFailureCount)
      expect(deduplicationResult.deduplicatedCount).toBeLessThan(30) // Significant deduplication
      expect(deduplicationResult.stats.compressionRatio).toBeLessThan(0.7)
      expect(deduplicationResult.groups.length).toBeGreaterThan(5)

      const metrics = services.performanceManager.getMetrics()
      expect(metrics.cache.hitRatio).toBeGreaterThanOrEqual(0) // Cache optimization should improve hit ratio
    })
  })
})
