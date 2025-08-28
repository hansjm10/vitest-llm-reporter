/**
 * Reporter Performance Benchmarks (Simplified)
 *
 * Consolidated reporter tests using parameterization and minimal core checks.
 */

import { describe, it, expect, afterEach } from 'vitest'
import type { Vitest, TestModule } from 'vitest'
import { LLMReporter } from '../../src/reporter/reporter'
import { BenchmarkRunner, TestDataGenerator, PerformanceAssertions } from './utils'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unlink } from 'node:fs/promises'

describe('Reporter Performance Benchmarks', () => {
  const runner = new BenchmarkRunner({ iterations: 50, warmupIterations: 5, timeout: 5000 })

  let tempFiles: string[] = []

  afterEach(async () => {
    for (const file of tempFiles) {
      try {
        await unlink(file)
      } catch {
        // ignore
      }
    }
    tempFiles = []
  })

  describe.each([
    ['single', 1, 50],
    ['small', 10, 200],
    ['medium', 100, 1000]
  ] as const)('Reporter %s suite', (_label, count, maxMs) => {
    it(`processes ${count} test(s) within ${maxMs}ms`, async () => {
      const tasks = TestDataGenerator.generateTests(count)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const module = TestDataGenerator.wrapTasksInModule(tasks)

      const result = await runner.run(`reporter_${_label}_suite`, async () => {
        const outputFile = join(tmpdir(), `bench-${_label}-${Date.now()}.json`)
        tempFiles.push(outputFile)

        const reporter = new LLMReporter({ outputFile, verbose: false, includePassedTests: true })
        reporter.onInit({ config: { root: '/test' } } as unknown as Vitest)
        await reporter.onTestRunEnd([module] as unknown as TestModule[], [], 'passed')
      })

      PerformanceAssertions.assertPerformance(result, maxMs, `Reporter ${_label}`)
      PerformanceAssertions.assertReliability(result, 95)
      PerformanceAssertions.assertResources(result, _label === 'medium' ? 75 : 50)

      expect(result.averageTime).toBeLessThanOrEqual(maxMs)
    })
  })

  it('reflects configuration impact', async () => {
    const tasks = TestDataGenerator.generateTests(50)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const module = TestDataGenerator.wrapTasksInModule(tasks)

    const verboseTrunc = await runner.run('reporter_verbose_trunc', async () => {
      const outputFile = join(tmpdir(), `bench-verbose-trunc-${Date.now()}.json`)
      tempFiles.push(outputFile)

      const reporter = new LLMReporter({
        outputFile,
        verbose: true,
        includePassedTests: true,
        truncation: { enabled: true, maxTokens: 5000 }
      })

      reporter.onInit({ config: { root: '/test' } } as unknown as Vitest)
      await reporter.onTestRunEnd([module] as unknown as TestModule[], [], 'passed')
    })

    const simple = await runner.run('reporter_simple', async () => {
      const outputFile = join(tmpdir(), `bench-simple-${Date.now()}.json`)
      tempFiles.push(outputFile)

      const reporter = new LLMReporter({ outputFile, verbose: false, includePassedTests: false })
      reporter.onInit({ config: { root: '/test' } } as unknown as Vitest)
      await reporter.onTestRunEnd([module] as unknown as TestModule[], [], 'passed')
    })

    // Expect performance difference to be within a reasonable factor (direction-agnostic)
    const ratio =
      Math.max(verboseTrunc.averageTime, simple.averageTime) /
      Math.min(verboseTrunc.averageTime, simple.averageTime)
    expect(ratio).toBeLessThan(3)
    PerformanceAssertions.assertReliability(verboseTrunc, 95)
    PerformanceAssertions.assertReliability(simple, 95)
  })

  it('handles error-heavy suites efficiently', async () => {
    const tasks = TestDataGenerator.generateTests(30, { failureRate: 0.5, complexErrorsEvery: 3 })
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const module = TestDataGenerator.wrapTasksInModule(tasks)

    const result = await runner.run('reporter_errors', async () => {
      const outputFile = join(tmpdir(), `bench-errors-${Date.now()}.json`)
      tempFiles.push(outputFile)

      const reporter = new LLMReporter({ outputFile, verbose: true, includePassedTests: true })
      reporter.onInit({ config: { root: '/test' } } as unknown as Vitest)
      await reporter.onTestRunEnd([module] as unknown as TestModule[], [], 'passed')
    })

    PerformanceAssertions.assertPerformance(result, 800, 'Error handling')
    PerformanceAssertions.assertReliability(result, 80)
    PerformanceAssertions.assertResources(result, 100)
  })
})
