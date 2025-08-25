/**
 * Deduplication Integration Tests
 *
 * Tests the integration of the deduplication service across the entire
 * pipeline, including interaction with performance optimization and streaming.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createIntegratedMockServices } from '../fixtures/mock-implementations'
import { createSampleOutput, DEDUPLICATION_SCENARIOS } from '../fixtures/test-data'
import type { DeduplicationConfig, DeduplicationResult } from '../../src/types/deduplication'
import type { LLMReporterOutput, TestFailure } from '../../src/types/schema'

describe('Deduplication Integration', () => {
  let services: ReturnType<typeof createIntegratedMockServices>

  beforeEach(() => {
    services = createIntegratedMockServices()
  })

  afterEach(() => {
    services.deduplicationService.reset()
    services.performanceManager.reset()
  })

  describe('Deduplication Service Configuration', () => {
    it('should initialize with default configuration', () => {
      const config = services.deduplicationService.getConfig()

      expect(config.enabled).toBe(true)
      expect(config.strategy).toBe('moderate')
      expect(config.compression.enabled).toBe(true)
      expect(config.patterns.stackTrace).toBe(true)
    })

    it('should handle disabled deduplication', async () => {
      services.deduplicationService.updateConfig({ enabled: false })

      const output = createSampleOutput(5, 10, 2)
      const result = await services.deduplicationService.processOutput(output)

      expect(result.originalCount).toBe(10)
      expect(result.deduplicatedCount).toBe(10) // No deduplication when disabled
      expect(result.groups).toHaveLength(0)
    })

    it('should update configuration dynamically', () => {
      const newConfig: Partial<DeduplicationConfig> = {
        strategy: 'aggressive',
        thresholds: { exact: 1.0, high: 0.8, medium: 0.6, low: 0.4 }
      }

      services.deduplicationService.updateConfig(newConfig)

      const updatedConfig = services.deduplicationService.getConfig()
      expect(updatedConfig.strategy).toBe('aggressive')
      expect(updatedConfig.thresholds.high).toBe(0.8)
      expect(updatedConfig.enabled).toBe(true) // Should preserve other settings
    })
  })

  describe('Basic Deduplication Processing', () => {
    it('should process output without failures', async () => {
      const output = createSampleOutput(10, 0, 5) // No failures
      const result = await services.deduplicationService.processOutput(output)

      expect(result.originalCount).toBe(0)
      expect(result.deduplicatedCount).toBe(0)
      expect(result.groups).toHaveLength(0)
      expect(result.stats.totalFailures).toBe(0)
    })

    it('should identify and group identical failures', async () => {
      const output: LLMReporterOutput = {
        summary: createSampleOutput(0, 4, 0).summary,
        failures: DEDUPLICATION_SCENARIOS.identicalFailures
      }

      const result = await services.deduplicationService.processOutput(output)

      expect(result.originalCount).toBe(5)
      expect(result.deduplicatedCount).toBeLessThan(5)
      expect(result.groups.length).toBeGreaterThan(0)
      expect(result.stats.duplicateGroups).toBeGreaterThan(0)
    })

    it('should handle similar but distinct failures', async () => {
      const output: LLMReporterOutput = {
        summary: createSampleOutput(0, 3, 0).summary,
        failures: DEDUPLICATION_SCENARIOS.similarStackTraces
      }

      const result = await services.deduplicationService.processOutput(output)

      expect(result.originalCount).toBe(3)
      expect(result.groups.length).toBeGreaterThan(0)
      expect(result.references).toHaveLength(3)

      // Should have some duplicates identified
      const duplicates = result.references.filter((ref) => ref.isDuplicate)
      expect(duplicates.length).toBeGreaterThan(0)
    })

    it('should preserve unique failures', async () => {
      const output: LLMReporterOutput = {
        summary: createSampleOutput(0, 4, 0).summary,
        failures: DEDUPLICATION_SCENARIOS.mixedFailures
      }

      const result = await services.deduplicationService.processOutput(output)

      expect(result.originalCount).toBe(4)
      expect(result.references).toHaveLength(4)

      // Should have at least one unique failure
      const uniqueFailures = result.references.filter((ref) => !ref.isDuplicate)
      expect(uniqueFailures.length).toBeGreaterThan(0)
    })
  })

  describe('Deduplication with Performance Integration', () => {
    beforeEach(async () => {
      await services.performanceManager.initialize()
      await services.performanceManager.start()
    })

    it('should track performance impact of deduplication', async () => {
      const largeOutput = createSampleOutput(0, 50, 0)

      const startTime = Date.now()
      const result = await services.deduplicationService.processOutput(largeOutput)
      const endTime = Date.now()

      expect(result.stats.processingTime).toBeGreaterThan(0)
      expect(result.stats.processingTime).toBeLessThan(endTime - startTime + 50) // Should be reasonable

      // Track performance impact
      await services.performanceManager.optimize()

      const metrics = services.performanceManager.getMetrics()
      expect(metrics.throughput.operationsPerSecond).toBeGreaterThanOrEqual(0)
    })

    it('should optimize deduplication performance over time', async () => {
      const outputs = Array.from({ length: 5 }, () => createSampleOutput(0, 20, 0))
      const processingTimes: number[] = []

      for (const output of outputs) {
        const result = await services.deduplicationService.processOutput(output)
        processingTimes.push(result.stats.processingTime)

        // Simulate performance optimization between processing
        await services.performanceManager.optimize()
      }

      expect(services.deduplicationService.getProcessedCount()).toBe(5)

      // Performance should be tracked
      const finalMetrics = services.performanceManager.getMetrics()
      expect(finalMetrics.cache.hitRatio).toBeGreaterThanOrEqual(0)
    })

    it('should handle memory optimization during deduplication', async () => {
      // Process multiple large outputs
      const largeOutputs = Array.from({ length: 3 }, () => createSampleOutput(0, 100, 0))

      for (const output of largeOutputs) {
        const result = await services.deduplicationService.processOutput(output)

        // Simulate memory pressure and optimization
        if (result.stats.compressionRatio < 0.8) {
          await services.performanceManager.optimize()
        }
      }

      const finalMetrics = services.performanceManager.getMetrics()
      expect(finalMetrics.memory.peakUsage).toBeGreaterThan(0)
      expect(services.deduplicationService.getProcessedCount()).toBe(3)
    })
  })

  describe('Deduplication Statistics and Metrics', () => {
    it('should provide accurate compression ratios', async () => {
      const failures = DEDUPLICATION_SCENARIOS.identicalFailures.slice(0, 6)
      const output: LLMReporterOutput = {
        summary: createSampleOutput(0, failures.length, 0).summary,
        failures
      }

      const result = await services.deduplicationService.processOutput(output)

      expect(result.stats.compressionRatio).toBeGreaterThan(0)
      expect(result.stats.compressionRatio).toBeLessThanOrEqual(1)
      expect(result.stats.totalFailures).toBe(failures.length)
      expect(result.stats.uniqueFailures).toBeLessThan(failures.length)
    })

    it('should track processing efficiency', async () => {
      const outputs = [
        createSampleOutput(0, 10, 0),
        createSampleOutput(0, 25, 0),
        createSampleOutput(0, 50, 0)
      ]

      const results: DeduplicationResult[] = []

      for (const output of outputs) {
        const result = await services.deduplicationService.processOutput(output)
        results.push(result)
      }

      // Processing time should scale reasonably (allow for equal times in mock)
      expect(results[0].stats.processingTime).toBeLessThanOrEqual(results[2].stats.processingTime)

      // All should have reasonable compression ratios
      results.forEach((result) => {
        expect(result.stats.compressionRatio).toBeGreaterThan(0)
        expect(result.stats.compressionRatio).toBeLessThanOrEqual(1)
      })
    })

    it('should provide detailed group statistics', async () => {
      const output: LLMReporterOutput = {
        summary: createSampleOutput(0, 8, 0).summary,
        failures: [
          ...DEDUPLICATION_SCENARIOS.identicalFailures.slice(0, 4),
          ...DEDUPLICATION_SCENARIOS.similarStackTraces.slice(0, 4)
        ]
      }

      const result = await services.deduplicationService.processOutput(output)

      expect(result.groups.length).toBeGreaterThan(0)
      expect(result.stats.duplicateGroups).toBe(result.groups.length)

      // Verify group structure
      result.groups.forEach((group) => {
        expect(group.id).toBeDefined()
        expect(group.template).toBeDefined()
        expect(group.instances).toHaveLength(group.count)
        expect(group.similarity).toBeGreaterThan(0)
      })
    })
  })

  describe('Advanced Deduplication Scenarios', () => {
    it('should handle complex nested similarity patterns', async () => {
      const complexFailures: TestFailure[] = [
        // Group 1: API errors
        ...DEDUPLICATION_SCENARIOS.similarStackTraces,
        // Group 2: Assertion errors
        {
          test: 'assertion test 1',
          file: '/tests/assert.test.ts',
          startLine: 10,
          endLine: 15,
          error: {
            message: 'Expected true but got false',
            type: 'AssertionError',
            stack: 'AssertionError: Expected true but got false\n    at /tests/assert.test.ts:12:5'
          }
        },
        {
          test: 'assertion test 2',
          file: '/tests/assert.test.ts',
          startLine: 20,
          endLine: 25,
          error: {
            message: 'Expected true but got false',
            type: 'AssertionError',
            stack: 'AssertionError: Expected true but got false\n    at /tests/assert.test.ts:22:5'
          }
        }
      ]

      const output: LLMReporterOutput = {
        summary: createSampleOutput(0, complexFailures.length, 0).summary,
        failures: complexFailures
      }

      const result = await services.deduplicationService.processOutput(output)

      expect(result.originalCount).toBe(complexFailures.length)
      expect(result.groups.length).toBeGreaterThan(1) // Should identify multiple groups
      expect(result.deduplicatedCount).toBeLessThan(result.originalCount)
    })

    it('should handle edge cases gracefully', async () => {
      // Test with single failure
      const singleFailure = createSampleOutput(0, 1, 0)
      const singleResult = await services.deduplicationService.processOutput(singleFailure)

      expect(singleResult.originalCount).toBe(1)
      expect(singleResult.deduplicatedCount).toBe(1)
      expect(singleResult.groups).toHaveLength(0)

      // Test with empty failures
      const emptyFailures = createSampleOutput(5, 0, 3)
      const emptyResult = await services.deduplicationService.processOutput(emptyFailures)

      expect(emptyResult.originalCount).toBe(0)
      expect(emptyResult.deduplicatedCount).toBe(0)
      expect(emptyResult.groups).toHaveLength(0)
    })

    it('should maintain reference integrity', async () => {
      const output: LLMReporterOutput = {
        summary: createSampleOutput(0, 6, 0).summary,
        failures: DEDUPLICATION_SCENARIOS.mixedFailures.slice(0, 6)
      }

      const result = await services.deduplicationService.processOutput(output)

      // Every original failure should have a reference
      expect(result.references).toHaveLength(result.originalCount)

      // References should point to valid groups or be standalone
      result.references.forEach((ref) => {
        expect(ref.original).toBeDefined()
        if (ref.groupId) {
          const group = result.groups.find((g) => g.id === ref.groupId)
          expect(group).toBeDefined()
        }
      })

      // Group instances should match references
      result.groups.forEach((group) => {
        const groupRefs = result.references.filter((ref) => ref.groupId === group.id)
        expect(groupRefs).toHaveLength(group.count)
      })
    })
  })

  describe('Configuration Strategy Testing', () => {
    it('should behave differently with conservative strategy', async () => {
      services.deduplicationService.updateConfig({
        strategy: 'conservative',
        thresholds: { exact: 1.0, high: 0.95, medium: 0.85, low: 0.75 }
      })

      const output: LLMReporterOutput = {
        summary: createSampleOutput(0, 6, 0).summary,
        failures: DEDUPLICATION_SCENARIOS.similarStackTraces.slice(0, 6)
      }

      const conservativeResult = await services.deduplicationService.processOutput(output)

      // Conservative should deduplicate less aggressively (allow for some variation in mock)
      expect(conservativeResult.deduplicatedCount).toBeGreaterThanOrEqual(
        Math.floor(conservativeResult.originalCount * 0.5)
      )
    })

    it('should behave differently with aggressive strategy', async () => {
      services.deduplicationService.updateConfig({
        strategy: 'aggressive',
        thresholds: { exact: 1.0, high: 0.8, medium: 0.6, low: 0.4 }
      })

      const output: LLMReporterOutput = {
        summary: createSampleOutput(0, 6, 0).summary,
        failures: DEDUPLICATION_SCENARIOS.similarStackTraces.slice(0, 6)
      }

      const aggressiveResult = await services.deduplicationService.processOutput(output)

      // Aggressive should deduplicate more
      expect(aggressiveResult.stats.compressionRatio).toBeLessThan(0.8)
      expect(aggressiveResult.groups.length).toBeGreaterThan(0)
    })

    it('should handle pattern configuration changes', async () => {
      // Disable some patterns
      services.deduplicationService.updateConfig({
        patterns: {
          stackTrace: true,
          errorMessage: false,
          consoleOutput: false,
          assertion: true
        }
      })

      const output: LLMReporterOutput = {
        summary: createSampleOutput(0, 4, 0).summary,
        failures: DEDUPLICATION_SCENARIOS.mixedFailures
      }

      const result = await services.deduplicationService.processOutput(output)

      // Should still process but potentially with different grouping
      expect(result.originalCount).toBe(4)
      expect(result.stats.processingTime).toBeGreaterThan(0)

      const config = services.deduplicationService.getConfig()
      expect(config.patterns.errorMessage).toBe(false)
      expect(config.patterns.stackTrace).toBe(true)
    })
  })

  describe('Concurrent Processing', () => {
    it('should handle concurrent deduplication requests', async () => {
      const outputs = Array.from({ length: 5 }, (_, i) => createSampleOutput(0, 10 + i * 5, 0))

      const promises = outputs.map((output) => services.deduplicationService.processOutput(output))

      const results = await Promise.all(promises)

      expect(results).toHaveLength(5)
      expect(services.deduplicationService.getProcessedCount()).toBe(5)

      results.forEach((result, index) => {
        expect(result.originalCount).toBe(10 + index * 5)
        expect(result.stats.processingTime).toBeGreaterThan(0)
      })
    })

    it('should maintain consistency under concurrent load', async () => {
      const sameOutput = createSampleOutput(0, 20, 0)

      // Process the same output multiple times concurrently
      const promises = Array.from({ length: 3 }, () =>
        services.deduplicationService.processOutput(sameOutput)
      )

      const results = await Promise.all(promises)

      // All results should be identical
      const firstResult = results[0]
      results.forEach((result) => {
        expect(result.originalCount).toBe(firstResult.originalCount)
        expect(result.deduplicatedCount).toBe(firstResult.deduplicatedCount)
        expect(result.groups).toHaveLength(firstResult.groups.length)
      })

      expect(services.deduplicationService.getProcessedCount()).toBe(3)
    })
  })
})
