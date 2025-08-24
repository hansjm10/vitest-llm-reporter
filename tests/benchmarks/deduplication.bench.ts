/**
 * Deduplication Performance Benchmarks (Simplified)
 *
 * Uses actual DeduplicationService.process with minimal, realistic data
 * and the simplified assertions.
 */

import { describe, it, expect } from 'vitest'
import { DeduplicationService } from '../../src/deduplication/DeduplicationService'
import { AssertionPattern } from '../../src/deduplication/patterns/AssertionPattern'
import { ConsoleOutputPattern } from '../../src/deduplication/patterns/ConsoleOutputPattern'
import { ErrorMessagePattern } from '../../src/deduplication/patterns/ErrorMessagePattern'
import { StackTracePattern } from '../../src/deduplication/patterns/StackTracePattern'
import {
  BenchmarkRunner,
  TestDataGenerator,
  PerformanceAssertions,
  BASELINE_METRICS
} from './utils'
import type { DuplicateEntry } from '../../src/types/deduplication'
import type { Task } from 'vitest'

function tasksToFailures(tasks: Task[]): DuplicateEntry[] {
  return tasks.map((t, idx) => {
    const error = t.result?.errors?.[0] as Error | undefined
    return {
      testId: t.id || `t-${idx}`,
      testName: t.name || `test-${idx}`,
      filePath: (t.file as any)?.filepath || (t.file as any)?.name || `file-${idx}.ts`,
      timestamp: new Date(),
      errorMessage: error?.message,
      stackTrace: error?.stack,
      consoleOutput: (t as any).consoleOutput as string[] | undefined
    }
  })
}

describe('Deduplication Performance Benchmarks', () => {
  const runner = new BenchmarkRunner({ iterations: 50, warmupIterations: 5, timeout: 10000 })

  describe.each([
    ['small', 20, 100],
    ['medium', 100, 500],
    ['baseline_1000', 1000, BASELINE_METRICS.DEDUPLICATION_LATENCY]
  ] as const)('Dataset %s', (label, count, maxMs) => {
    it(
      `processes ${count} failures within ${maxMs}ms`,
      async () => {
        const tasks = TestDataGenerator.generateTests(count, {
          failureRate: 0.5,
          consoleLines: 20,
          consoleEvery: 5,
          complexErrorsEvery: 10
        })
        const failures = tasksToFailures(tasks)

        const result = await runner.run(`dedup_${label}`, () => {
          const service = new DeduplicationService()
          // Add realistic matchers
          service.addPattern(new StackTracePattern())
          service.addPattern(new ErrorMessagePattern())
          service.addPattern(new ConsoleOutputPattern())
          service.addPattern(new AssertionPattern())

          service.process(failures)
        })

        PerformanceAssertions.assertPerformance(result, maxMs, `Dedup ${label}`)
        PerformanceAssertions.assertReliability(result, 95)
        PerformanceAssertions.assertResources(result, label === 'baseline_1000' ? 400 : 150)

        expect(result.averageTime).toBeLessThanOrEqual(maxMs)
      },
      label === 'baseline_1000' ? 20000 : 5000
    )
  })

  it('handles high-similarity datasets efficiently', async () => {
    const baseMessage = 'Common error message that appears frequently'
    const tasks = TestDataGenerator.generateTests(120, { failureRate: 0.8 })
    for (let i = 0; i < tasks.length; i += 5) {
      if (tasks[i].result) {
        tasks[i].result.state = 'fail'
        tasks[i].result.errors = [new Error(baseMessage)]
      }
    }
    const failures = tasksToFailures(tasks)

    const result = await runner.run('dedup_high_similarity', () => {
      const service = new DeduplicationService()
      service.addPattern(new ErrorMessagePattern())
      service.process(failures)
    })

    PerformanceAssertions.assertPerformance(result, 600, 'High similarity')
    PerformanceAssertions.assertReliability(result, 95)
    PerformanceAssertions.assertResources(result, 200)
  })
})
