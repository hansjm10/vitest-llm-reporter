/**
 * Large Test Suite Performance Benchmarks (Simplified)
 *
 * Focuses on reporter throughput for large suites using parameterized sizes
 * and the simplified assertion API.
 */

import { describe, it, expect, afterEach, beforeAll } from 'vitest'
import type { Vitest, TestModule } from 'vitest'
import { LLMReporter } from '../../src/reporter/reporter'
import {
  BenchmarkRunner,
  TestDataGenerator,
  PerformanceAssertions,
  BASELINE_METRICS
} from './utils'
import { loadBaseline, assertNoRegression, type BaselineMetrics } from './baseline-comparator'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unlink } from 'node:fs/promises'

describe('Large Test Suite Performance Benchmarks', () => {
  const runner = new BenchmarkRunner({ iterations: 10, warmupIterations: 2, timeout: 30000 })

  let tempFiles: string[] = []
  let baseline: BaselineMetrics

  beforeAll(() => {
    try {
      baseline = loadBaseline()
    } catch (_error) {
      console.warn('⚠️  No baseline metrics found, skipping regression detection')
    }
  })

  afterEach(async () => {
    for (const file of tempFiles) {
      try {
        await unlink(file)
      } catch {
        // ignore cleanup
      }
    }
    tempFiles = []
  })

  describe.each([
    ['1000', 1000, BASELINE_METRICS.LARGE_SUITE_LATENCY, 500],
    ['2000', 2000, 10000, 800]
  ] as const)('Reporter processes %s tests', (_label, count, maxMs, maxMemMB) => {
    it(`completes within ${maxMs}ms`, async () => {
      const tests = TestDataGenerator.generateTests(count)

      const module = TestDataGenerator.wrapTasksInModule(tests)

      const result = await runner.run(`large_suite_${_label}`, async () => {
        const outputFile = join(tmpdir(), `bench-${_label}-${Date.now()}.json`)
        tempFiles.push(outputFile)

        const reporter = new LLMReporter({
          outputFile,
          verbose: false,
          includePassedTests: count <= 1000,
          truncationEnabled: count > 1000,
          maxTokens: count > 1000 ? 10000 : undefined
        })

        reporter.onInit({ config: { root: '/test' } } as unknown as Vitest)
        await reporter.onTestRunEnd([module] as unknown as TestModule[], [], 'passed')
      })

      PerformanceAssertions.assertPerformance(result, maxMs, `Large suite ${_label}`)
      PerformanceAssertions.assertReliability(result, 85)
      PerformanceAssertions.assertResources(result, maxMemMB)

      // Check against baseline if available
      if (baseline) {
        assertNoRegression(`large_suite_${_label}`, result, baseline)
      }

      expect(result.averageTime).toBeLessThanOrEqual(maxMs)
    })
  })

  it('handles memory pressure patterns at scale', async () => {
    const tests = TestDataGenerator.generateTests(1500, {
      failureRate: 0.3,
      consoleLines: 100,
      consoleEvery: 10,
      complexErrorsEvery: 15
    })

    const module = TestDataGenerator.wrapTasksInModule(tests)

    const result = await runner.run('large_suite_memory_pressure', async () => {
      const outputFile = join(tmpdir(), `bench-memory-${Date.now()}.json`)
      tempFiles.push(outputFile)

      const reporter = new LLMReporter({
        outputFile,
        verbose: true,
        includePassedTests: false,
        truncationEnabled: true,
        maxTokens: 8000
      })

      reporter.onInit({ config: { root: '/test' } } as unknown as Vitest)
      await reporter.onTestRunEnd([module] as unknown as TestModule[], [], 'passed')
    })

    PerformanceAssertions.assertPerformance(result, 12000, 'Memory pressure suite')
    PerformanceAssertions.assertReliability(result, 85)
    PerformanceAssertions.assertResources(result, 900)

    // Check against baseline if available
    if (baseline) {
      assertNoRegression('large_suite_memory_pressure', result, baseline)
    }
  })
})
