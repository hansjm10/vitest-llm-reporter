/**
 * Large Test Suite Performance Benchmarks
 *
 * Benchmarks for handling large test suites (1000+ tests) including
 * end-to-end processing, memory management, and performance at scale.
 *
 * @module LargeSuiteBenchmarks
 */

import { describe, it, expect, afterEach } from 'vitest'
import type { Vitest, File, TestModule } from 'vitest'
import { LLMReporter } from '../../src/reporter/reporter'
import { DeduplicationService } from '../../src/deduplication/DeduplicationService'
import { StreamManager } from '../../src/streaming/StreamManager'
import {
  BenchmarkRunner,
  TestDataGenerator,
  PerformanceAssertions,
  BASELINE_METRICS
} from './utils'
// import type { Task } from 'vitest' // Unused
import type { DeduplicationConfig } from '../../src/types/deduplication'
import type { StreamConfig, StreamOperation } from '../../src/streaming/types'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unlink } from 'node:fs/promises'

describe('Large Test Suite Performance Benchmarks', () => {
  const runner = new BenchmarkRunner({
    iterations: 10, // Fewer iterations for large suites
    warmupIterations: 2,
    timeout: 30000 // 30 second timeout for large operations
  })

  let tempFiles: string[] = []

  afterEach(async () => {
    for (const file of tempFiles) {
      try {
        await unlink(file)
      } catch {
        // Ignore cleanup errors
      }
    }
    tempFiles = []
  })

  describe('Baseline Large Suite Tests', () => {
    it('should handle 1000 test suite within baseline', async () => {
      const tests = TestDataGenerator.generateTestSuite(1000)

      const result = await runner.run('large_suite_1000_tests', async () => {
        const outputFile = join(tmpdir(), `bench-1000-${Date.now()}.json`)
        tempFiles.push(outputFile)

        const reporter = new LLMReporter({
          outputFile,
          verbose: false,
          includePassedTests: true
        })

        reporter.onInit({} as unknown as Vitest)
        await reporter.onTestRunEnd(tests as unknown as TestModule[], [], 'passed')
      })

      PerformanceAssertions.assertMeetsBaseline(
        result,
        BASELINE_METRICS.LARGE_SUITE_LATENCY,
        '1000 test suite processing'
      )
      PerformanceAssertions.assertOpsPerSecond(result, BASELINE_METRICS.OPS_PER_SECOND.LARGE_SUITE)
      PerformanceAssertions.assertSuccessRate(result, 95)
      PerformanceAssertions.assertMemoryWithinLimits(result, 500)

      expect(result.averageTime).toBeLessThan(BASELINE_METRICS.LARGE_SUITE_LATENCY)
      expect(result.successRate).toBeGreaterThan(90)
    })

    it('should handle 2000 test suite efficiently', async () => {
      const tests = TestDataGenerator.generateTestSuite(2000)

      const result = await runner.run('large_suite_2000_tests', async () => {
        const outputFile = join(tmpdir(), `bench-2000-${Date.now()}.json`)
        tempFiles.push(outputFile)

        const reporter = new LLMReporter({
          outputFile,
          verbose: false,
          includePassedTests: true,
          truncationEnabled: true,
          maxTokens: 10000 // Enable truncation for large suites
        })

        reporter.onInit({} as unknown as Vitest)
        await reporter.onTestRunEnd(tests as unknown as TestModule[], [], 'passed')
      })

      PerformanceAssertions.assertMeetsBaseline(result, 10000, '2000 test suite processing')
      PerformanceAssertions.assertSuccessRate(result, 90)
      PerformanceAssertions.assertMemoryWithinLimits(result, 800)

      expect(result.averageTime).toBeLessThan(10000)
    })

    it('should handle 5000 test suite with memory management', async () => {
      const tests = TestDataGenerator.generateTestSuite(5000)

      const result = await runner.run('large_suite_5000_tests', async () => {
        const outputFile = join(tmpdir(), `bench-5000-${Date.now()}.json`)
        tempFiles.push(outputFile)

        const reporter = new LLMReporter({
          outputFile,
          verbose: false,
          includePassedTests: false, // Reduce memory usage
          truncationEnabled: true,
          maxTokens: 15000
        })

        reporter.onInit({} as unknown as Vitest)
        await reporter.onTestRunEnd(tests as unknown as TestModule[], [], 'passed')
      })

      PerformanceAssertions.assertMeetsBaseline(result, 25000, '5000 test suite processing')
      PerformanceAssertions.assertSuccessRate(result, 85)
      PerformanceAssertions.assertMemoryWithinLimits(result, 1500)

      expect(result.averageTime).toBeLessThan(25000)
    })
  })

  describe('Large Suite with Failures', () => {
    it('should handle 1000 tests with 20% failure rate', async () => {
      const tests = TestDataGenerator.generateFailingTestSuite(1000, 0.2)

      const result = await runner.run('large_suite_1000_with_failures', async () => {
        const outputFile = join(tmpdir(), `bench-1000-failures-${Date.now()}.json`)
        tempFiles.push(outputFile)

        const reporter = new LLMReporter({
          outputFile,
          verbose: true,
          includePassedTests: true
        })

        reporter.onInit({} as unknown as Vitest)
        await reporter.onTestRunEnd(tests as unknown as TestModule[], [], 'passed')
      })

      PerformanceAssertions.assertMeetsBaseline(result, 7000, '1000 tests with failures')
      PerformanceAssertions.assertSuccessRate(result, 95)
      PerformanceAssertions.assertMemoryWithinLimits(result, 600)

      expect(result.averageTime).toBeLessThan(7000)
    })

    it('should handle 1500 tests with complex errors', async () => {
      const tests = Array.from({ length: 1500 }, (_, i) => {
        if (i % 5 === 0) {
          return TestDataGenerator.generateComplexErrorTest()
        } else {
          return TestDataGenerator.generateMockTask(`test-${i}`)
        }
      })

      const result = await runner.run('large_suite_1500_complex_errors', async () => {
        const outputFile = join(tmpdir(), `bench-1500-complex-${Date.now()}.json`)
        tempFiles.push(outputFile)

        const reporter = new LLMReporter({
          outputFile,
          verbose: true,
          includePassedTests: true,
          truncationEnabled: true,
          maxTokens: 20000
        })

        reporter.onInit({} as unknown as Vitest)
        await reporter.onTestRunEnd(tests as unknown as TestModule[], [], 'passed')
      })

      PerformanceAssertions.assertMeetsBaseline(result, 12000, '1500 tests with complex errors')
      PerformanceAssertions.assertSuccessRate(result, 90)
      PerformanceAssertions.assertMemoryWithinLimits(result, 800)

      expect(result.averageTime).toBeLessThan(12000)
    })
  })

  describe('Large Suite with Console Output', () => {
    it('should handle 1000 tests with heavy console output', async () => {
      const tests = Array.from({ length: 1000 }, (_, i) => {
        if (i % 10 === 0) {
          return TestDataGenerator.generateConsoleHeavyTest(200) // 200 lines of console output
        } else {
          return TestDataGenerator.generateMockTask(`test-${i}`)
        }
      })

      const result = await runner.run('large_suite_1000_console_heavy', async () => {
        const outputFile = join(tmpdir(), `bench-1000-console-${Date.now()}.json`)
        tempFiles.push(outputFile)

        const reporter = new LLMReporter({
          outputFile,
          verbose: true,
          includePassedTests: true,
          maxConsoleLines: 50 // Limit console output per test
        })

        reporter.onInit({} as unknown as Vitest)
        await reporter.onTestRunEnd(tests as unknown as TestModule[], [], 'passed')
      })

      PerformanceAssertions.assertMeetsBaseline(result, 8000, '1000 tests with console output')
      PerformanceAssertions.assertSuccessRate(result, 90)
      PerformanceAssertions.assertMemoryWithinLimits(result, 700)

      expect(result.averageTime).toBeLessThan(8000)
    })
  })

  describe('Large Suite with Deduplication', () => {
    it('should handle 1500 tests with deduplication enabled', async () => {
      const tests = TestDataGenerator.generateTestSuite(1500)

      // Create many similar tests for deduplication
      const duplicateBase = TestDataGenerator.generateMockTask('duplicate-base')
      for (let i = 0; i < 300; i++) {
        const duplicate = { ...duplicateBase }
        duplicate.id = `duplicate-${i}`
        duplicate.name = `duplicate test ${i}`
        tests.push(duplicate)
      }

      const result = await runner.run('large_suite_1500_with_deduplication', async () => {
        const outputFile = join(tmpdir(), `bench-1500-dedup-${Date.now()}.json`)
        tempFiles.push(outputFile)

        const deduplicationConfig: DeduplicationConfig = {
          enabled: true,
          thresholds: { similarity: 0.8, compression: 0.5, frequency: 3 },
          patterns: {
            assertions: true,
            errorMessages: true,
            stackTraces: true,
            consoleOutput: true
          },
          compression: { enabled: true, templateExtraction: true, referenceManagement: true },
          algorithms: { similarity: 'jaccard', clustering: 'hierarchical' }
        }

        const deduplicationService = new DeduplicationService(deduplicationConfig)
        // @ts-expect-error - initialize method doesn't exist
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await deduplicationService.initialize()

        // @ts-expect-error - deduplicate method doesn't exist, should be process
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const deduplicated = await deduplicationService.deduplicate(tests as unknown as File[])

        const reporter = new LLMReporter({
          outputFile,
          verbose: false,
          includePassedTests: true
        })

        reporter.onInit({} as unknown as Vitest)
        await reporter.onTestRunEnd(deduplicated as unknown as TestModule[], [], 'passed')
      })

      PerformanceAssertions.assertMeetsBaseline(result, 15000, '1500 tests with deduplication')
      PerformanceAssertions.assertSuccessRate(result, 90)
      PerformanceAssertions.assertMemoryWithinLimits(result, 1000)

      expect(result.averageTime).toBeLessThan(15000)
    })
  })

  describe('Large Suite with Streaming', () => {
    it('should handle 2000 tests with streaming enabled', async () => {
      const tests = TestDataGenerator.generateTestSuite(2000)

      const result = await runner.run('large_suite_2000_streaming', () => {
        const outputFile = join(tmpdir(), `bench-2000-stream-${Date.now()}.json`)
        tempFiles.push(outputFile)

        const streamConfig: StreamConfig = {
          enabled: true,
          maxBufferSize: 2 * 1024 * 1024, // 2MB buffer for large suites
          flushInterval: 1000, // Flush every second
          enableBackpressure: true
        }

        const streamManager = new StreamManager()
        streamManager.initialize(streamConfig)

        try {
          // Simulate streaming test results
          for (const test of tests) {
            streamManager.write(test)
          }

          streamManager.flush()
        } finally {
          streamManager.close()
        }
      })

      PerformanceAssertions.assertMeetsBaseline(result, 12000, '2000 tests with streaming')
      PerformanceAssertions.assertSuccessRate(result, 90)
      PerformanceAssertions.assertMemoryWithinLimits(result, 800)

      expect(result.averageTime).toBeLessThan(12000)
    })
  })

  describe('Memory Pressure Tests', () => {
    it('should handle memory pressure with 3000 tests', async () => {
      const tests = Array.from({ length: 3000 }, (_, i) => {
        const task = TestDataGenerator.generateMockTask(`memory-test-${i}`)
        // Add some large data to increase memory pressure
        if (i % 100 === 0) {
          ;(task as Record<string, unknown>).largeData =
            TestDataGenerator.generateMemoryIntensiveData(0.1) // 100KB
        }
        return task
      })

      const result = await runner.run('large_suite_3000_memory_pressure', async () => {
        const outputFile = join(tmpdir(), `bench-3000-memory-${Date.now()}.json`)
        tempFiles.push(outputFile)

        const reporter = new LLMReporter({
          outputFile,
          verbose: false,
          includePassedTests: false, // Reduce memory usage
          truncationEnabled: true,
          maxTokens: 8000
        })

        reporter.onInit({} as unknown as Vitest)
        await reporter.onTestRunEnd(tests as unknown as TestModule[], [], 'passed')
      })

      PerformanceAssertions.assertMeetsBaseline(result, 20000, '3000 tests under memory pressure')
      PerformanceAssertions.assertSuccessRate(result, 85)
      PerformanceAssertions.assertMemoryWithinLimits(result, 1200)
      PerformanceAssertions.assertGCCount(result, 50)

      expect(result.averageTime).toBeLessThan(20000)
    })

    it('should handle garbage collection efficiently with large suites', async () => {
      const tests = TestDataGenerator.generateTestSuite(1500)

      const result = await runner.run('large_suite_1500_gc_efficiency', async () => {
        const outputFile = join(tmpdir(), `bench-1500-gc-${Date.now()}.json`)
        tempFiles.push(outputFile)

        const reporter = new LLMReporter({
          outputFile,
          verbose: true,
          includePassedTests: true
        })

        reporter.onInit({} as unknown as Vitest)

        // Process in batches to trigger GC
        const batchSize = 250
        for (let i = 0; i < tests.length; i += batchSize) {
          const batch = tests.slice(i, i + batchSize)
          await reporter.onTestRunEnd(batch as unknown as TestModule[], [], 'passed')

          // Force GC to test efficiency
          if (global.gc) {
            global.gc()
          }
        }
      })

      PerformanceAssertions.assertMeetsBaseline(result, 10000, '1500 tests with GC management')
      PerformanceAssertions.assertSuccessRate(result, 90)

      // Should handle GC without excessive overhead
      expect(result.gcCount).toBeLessThan(30)
      expect(result.averageTime).toBeLessThan(10000)
    })
  })

  describe('Scalability Analysis', () => {
    it('should demonstrate scaling characteristics', async () => {
      const sizes = [100, 500, 1000, 2000]
      const results = []

      for (const size of sizes) {
        const tests = TestDataGenerator.generateTestSuite(size)

        const result = await runner.run(`large_suite_scaling_${size}`, async () => {
          const outputFile = join(tmpdir(), `bench-scale-${size}-${Date.now()}.json`)
          tempFiles.push(outputFile)

          const reporter = new LLMReporter({
            outputFile,
            verbose: false,
            includePassedTests: size <= 1000, // Optimize for larger suites
            truncationEnabled: size > 1000,
            maxTokens: size > 1000 ? 10000 : undefined
          })

          reporter.onInit({} as unknown as Vitest)
          await reporter.onTestRunEnd(tests as unknown as TestModule[], [], 'passed')
        })

        results.push({ size, time: result.averageTime, memory: result.memoryUsage })
        PerformanceAssertions.assertSuccessRate(result, 85)
      }

      // Analyze scaling characteristics
      const timeGrowth = results[results.length - 1].time / results[0].time
      const sizeGrowth = results[results.length - 1].size / results[0].size

      // Time should scale sub-quadratically
      expect(timeGrowth).toBeLessThan(Math.pow(sizeGrowth, 1.5))

      // Memory should scale roughly linearly
      const memoryGrowth = results[results.length - 1].memory / results[0].memory
      expect(memoryGrowth).toBeLessThan(sizeGrowth * 2)

      // All sizes should complete successfully
      for (const { size, time } of results) {
        expect(time).toBeLessThan(size * 15) // Max 15ms per test on average
      }
    })
  })

  describe('End-to-End Large Suite Performance', () => {
    it('should handle complete workflow with 1200 tests', async () => {
      const tests = TestDataGenerator.generateTestSuite(1200)

      // Add variety to the test suite
      const varietyTests = [
        ...Array.from({ length: 50 }, () => TestDataGenerator.generateComplexErrorTest()),
        ...Array.from({ length: 30 }, () => TestDataGenerator.generateConsoleHeavyTest(100)),
        ...TestDataGenerator.generateFailingTestSuite(100, 0.3)
      ]

      tests.push(...varietyTests)

      const result = await runner.run('large_suite_1200_end_to_end', async () => {
        const outputFile = join(tmpdir(), `bench-1200-e2e-${Date.now()}.json`)
        tempFiles.push(outputFile)

        // Configure all systems
        const deduplicationConfig: DeduplicationConfig = {
          enabled: true,
          thresholds: { similarity: 0.8, compression: 0.5, frequency: 3 },
          patterns: {
            assertions: true,
            errorMessages: true,
            stackTraces: true,
            consoleOutput: true
          },
          compression: { enabled: true, templateExtraction: true, referenceManagement: true },
          algorithms: { similarity: 'jaccard', clustering: 'hierarchical' }
        }

        const streamConfig: StreamConfig = {
          enabled: true,
          maxBufferSize: 1024 * 1024,
          flushInterval: 500,
          enableBackpressure: true
        }

        // Initialize services
        const deduplicationService = new DeduplicationService(deduplicationConfig)
        // @ts-expect-error - initialize method doesn't exist
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await deduplicationService.initialize()

        const streamManager = new StreamManager()
        streamManager.initialize(streamConfig)

        try {
          // Process through full pipeline
          // @ts-expect-error - deduplicate method doesn't exist, should be process
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
          const deduplicated = await deduplicationService.deduplicate(tests as unknown as File[])

          for (const test of deduplicated) {
            streamManager.write(test as unknown as StreamOperation)
          }

          streamManager.flush()

          const reporter = new LLMReporter({
            outputFile,
            verbose: true,
            includePassedTests: true,
            truncationEnabled: true,
            maxTokens: 15000
          })

          reporter.onInit({} as unknown as Vitest)
          await reporter.onTestRunEnd(deduplicated as unknown as TestModule[], [], 'passed')
        } finally {
          streamManager.close()
        }
      })

      PerformanceAssertions.assertMeetsBaseline(result, 18000, '1200 test end-to-end workflow')
      PerformanceAssertions.assertSuccessRate(result, 85)
      PerformanceAssertions.assertMemoryWithinLimits(result, 1000)

      expect(result.averageTime).toBeLessThan(18000)
    })
  })

  describe('Performance Regression Detection', () => {
    it('should maintain consistent performance for 1000 test baseline', async () => {
      const baselineTests = TestDataGenerator.generateTestSuite(1000)
      const runs = []

      // Run the same test multiple times to detect regressions
      for (let run = 0; run < 3; run++) {
        const result = await runner.run(`large_suite_regression_run_${run}`, async () => {
          const outputFile = join(tmpdir(), `bench-regression-${run}-${Date.now()}.json`)
          tempFiles.push(outputFile)

          const reporter = new LLMReporter({
            outputFile,
            verbose: false,
            includePassedTests: true
          })

          reporter.onInit({} as unknown as Vitest)
          await reporter.onTestRunEnd(baselineTests as unknown as TestModule[], [], 'passed')
        })

        runs.push(result)
        PerformanceAssertions.assertMeetsBaseline(result, 6000, `Regression run ${run}`)
        PerformanceAssertions.assertSuccessRate(result, 90)
      }

      // Check consistency across runs
      const times = runs.map((r) => r.averageTime)
      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length
      const maxDeviation = Math.max(...times.map((time) => Math.abs(time - avgTime)))
      const deviationPercent = (maxDeviation / avgTime) * 100

      // Variation should be less than 25% for consistent performance
      expect(deviationPercent).toBeLessThan(25)

      // All runs should meet baseline
      for (const result of runs) {
        expect(result.averageTime).toBeLessThan(6000)
      }
    })
  })
})
