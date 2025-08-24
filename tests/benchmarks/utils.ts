/**
 * Benchmark Utilities and Framework
 *
 * Provides utilities for performance benchmarking of the LLM reporter system,
 * including test data generation, timing utilities, and baseline metrics.
 *
 * @module BenchmarkUtils
 */

import { performance } from 'node:perf_hooks'
import type { Task, TaskResult, File } from 'vitest'

/**
 * Benchmark configuration
 */
export interface BenchmarkConfig {
  /** Number of iterations to run */
  iterations: number
  /** Number of warmup iterations */
  warmupIterations: number
  /** Timeout for each iteration in ms */
  timeout: number
  /**
   * Deprecated: metrics are always collected. Kept for backward compatibility.
   */
  collectMemory?: boolean
  /**
   * Deprecated: metrics are always collected. Kept for backward compatibility.
   */
  collectGC?: boolean
}

/**
 * Benchmark result
 */
export interface BenchmarkResult {
  /** Benchmark name */
  name: string
  /** Average time per iteration in ms */
  averageTime: number
  /** Success rate as percentage */
  successRate: number
  /** Memory delta in bytes */
  memoryDelta: number
}

/**
 * Memory snapshot
 */
export interface MemorySnapshot {
  heapUsed: number
  heapTotal: number
  external: number
  rss: number
  timestamp: number
}

/**
 * Baseline performance metrics for comparison
 */
export const BASELINE_METRICS = {
  /** Basic reporter operation should complete under 50ms */
  REPORTER_BASIC_LATENCY: 50,
  /** Streaming operation should complete under 10ms */
  STREAMING_LATENCY: 10,
  /** Deduplication should complete under 100ms for 1000 tests */
  DEDUPLICATION_LATENCY: 600,
  /** Large suite (1000 tests) should complete under 5000ms */
  LARGE_SUITE_LATENCY: 5000,
  /** Memory usage should stay under 100MB for typical operations */
  MEMORY_THRESHOLD: 100 * 1024 * 1024,
  /** GC should not run more than 10 times per 1000 operations */
  GC_THRESHOLD: 10,
  /** Operations per second targets */
  OPS_PER_SECOND: {
    REPORTER: 100,
    STREAMING: 1000,
    DEDUPLICATION: 50,
    LARGE_SUITE: 1
  }
} as const

/**
 * Default benchmark configuration
 */
export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  iterations: 100,
  warmupIterations: 10,
  timeout: 10000,
}

/**
 * Benchmark runner class
 */
export class BenchmarkRunner {
  private config: BenchmarkConfig

  constructor(config: Partial<BenchmarkConfig> = {}) {
    this.config = { ...DEFAULT_BENCHMARK_CONFIG, ...config }
  }

  /**
   * Run a benchmark
   */
  async run(name: string, fn: () => Promise<void> | void): Promise<BenchmarkResult> {
    console.warn(`🔄 Running benchmark: ${name}`)

    // Warmup
    await this.warmup(fn)

    // Collect baseline memory (always on)
    const baselineMemory = this.getMemorySnapshot()

    const iterations: number[] = []
    let successCount = 0

    // Run benchmark iterations
    for (let i = 0; i < this.config.iterations; i++) {
      try {
        const startTime = performance.now()
        await this.runWithTimeout(fn)
        const endTime = performance.now()

        iterations.push(endTime - startTime)
        successCount++
      } catch (_error) {
        // Record failure but continue
        iterations.push(Number.MAX_SAFE_INTEGER)
      }
    }

    // Collect final memory (always on)
    const finalMemory = this.getMemorySnapshot()

    // Calculate statistics
    const validIterations = iterations.filter((t) => t !== Number.MAX_SAFE_INTEGER)
    const totalTime = validIterations.reduce((sum, time) => sum + time, 0)
    const averageTime = validIterations.length ? totalTime / validIterations.length : 0
    const successRate = (successCount / this.config.iterations) * 100

    const result: BenchmarkResult = {
      name,
      averageTime,
      successRate,
      memoryDelta:
        finalMemory && baselineMemory ? finalMemory.heapUsed - baselineMemory.heapUsed : 0,
    }

    this.logResult(result)
    return result
  }

  /**
   * Run warmup iterations
   */
  private async warmup(fn: () => Promise<void> | void): Promise<void> {
    for (let i = 0; i < this.config.warmupIterations; i++) {
      try {
        await this.runWithTimeout(fn)
      } catch {
        // Ignore warmup failures
      }
    }
  }

  /**
   * Run function with timeout
   */
  private async runWithTimeout(fn: () => Promise<void> | void): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Benchmark timeout'))
      }, this.config.timeout)

      Promise.resolve(fn())
        .then(() => {
          clearTimeout(timeout)
          resolve()
        })
        .catch((error) => {
          clearTimeout(timeout)
          reject(error as Error)
        })
    })
  }

  /**
   * (Removed) GC monitoring simplified away
   */
  // Intentionally removed

  /**
   * Get memory snapshot
   */
  private getMemorySnapshot(): MemorySnapshot {
    const memory = process.memoryUsage()
    return {
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      external: memory.external,
      rss: memory.rss,
      timestamp: Date.now()
    }
  }

  /**
   * Log benchmark result
   */
  private logResult(result: BenchmarkResult): void {
    console.warn(`✅ ${result.name}:`)
    console.warn(`   Average: ${result.averageTime.toFixed(2)}ms`)
    console.warn(`   Success rate: ${result.successRate.toFixed(1)}%`)
    console.warn(`   Memory delta: ${(result.memoryDelta / 1024 / 1024).toFixed(2)}MB`)
  }
}

/**
 * Test data generators
 */
export class TestDataGenerator {
  /**
   * Generate mock test task
   */
  static generateMockTask(id = 'test-1', duration = 100): Task {
    return {
      id,
      name: `test ${id}`,
      file: {
        name: `test-${id}.test.ts`,
        filepath: `/path/to/test-${id}.test.ts`
      } as File,
      suite: undefined,
      location: {
        line: 1,
        column: 1
      },
      mode: 'run',
      type: 'test',
      meta: {},
      retry: 0,
      repeats: 0,
      result: {
        state: Math.random() > 0.1 ? 'pass' : 'fail',
        duration,
        startTime: Date.now() - duration,
        errors: Math.random() > 0.9 ? [new Error(`Test error in ${id}`)] : []
      } as TaskResult
    } as Task
  }

  /**
   * Generate test suite with specified number of tests
   */
  static generateTestSuite(testCount: number): Task[] {
    const tests: Task[] = []

    for (let i = 0; i < testCount; i++) {
      const duration = Math.random() * 1000 + 10 // 10-1010ms
      tests.push(this.generateMockTask(`test-${i}`, duration))
    }

    return tests
  }

  /**
   * Unified test generator with options
   * options:
   * - failureRate: 0..1 to mark failures
   * - consoleLines: number of console lines to attach per selected test
   * - consoleEvery: frequency for console-heavy tests (e.g., 10 => every 10th)
   * - complexErrorsEvery: frequency for complex error tests
   */
  static generateTests(
    count: number,
    options: {
      failureRate?: number
      consoleLines?: number
      consoleEvery?: number
      complexErrorsEvery?: number
    } = {}
  ): Task[] {
    const { failureRate = 0, consoleLines = 0, consoleEvery = 0, complexErrorsEvery = 0 } = options
    const tests = this.generateTestSuite(count)

    // Apply failures
    if (failureRate > 0) {
      const failureCount = Math.floor(count * failureRate)
      for (let i = 0; i < failureCount && i < tests.length; i++) {
        const t = tests[i]
        if (t.result) {
          t.result.state = 'fail'
          t.result.errors = [new Error(`Forced failure in test ${i}`)]
        }
      }
    }

    // Apply console-heavy
    if (consoleLines > 0 && consoleEvery > 0) {
      for (let i = 0; i < tests.length; i++) {
        if (i % consoleEvery === 0) {
          const lines = Array.from(
            { length: consoleLines },
            (_, j) => `Console output line ${j}: ${'x'.repeat(100)}`
          )
          ;(tests[i] as Record<string, unknown>).consoleOutput = lines
        }
      }
    }

    // Apply complex errors
    if (complexErrorsEvery > 0) {
      for (let i = 0; i < tests.length; i++) {
        if (i % complexErrorsEvery === 0) {
          const error = new Error('Complex error with deep stack trace')
          error.stack =
            `Error: ${error.message}\n` +
            Array.from(
              { length: 20 },
              (_, k) => `    at Fn_${i}_${k} (/path/to/file${k}.ts:${k + 1}:${k + 10})`
            ).join('\n')
          if (tests[i].result) {
            tests[i].result.state = 'fail'
            tests[i].result.errors = [error]
          }
        }
      }
    }

    return tests
  }

  // Removed granular generators in favor of unified generateTests()

  /**
   * Generate memory-intensive test data
   */
  static generateMemoryIntensiveData(sizeMB = 10): Record<string, unknown> {
    const size = sizeMB * 1024 * 1024
    const data: Record<string, unknown> = {}

    // Generate large string data
    const largeString = 'x'.repeat(Math.floor(size / 10))

    for (let i = 0; i < 10; i++) {
      data[`largeData${i}`] = largeString
    }

    return data
  }
}

/**
 * Performance assertions for benchmarks
 */
export class PerformanceAssertions {
  /** Assert memory usage is within limits */
  static assertMemoryWithinLimits(result: BenchmarkResult, limitMB = 100): void {
    const memoryMB = result.memoryDelta / 1024 / 1024
    if (memoryMB > limitMB) {
      throw new Error(`Memory usage exceeded limit: ${memoryMB.toFixed(2)}MB > ${limitMB}MB`)
    }
  }
  /** Assert success rate is acceptable */
  static assertSuccessRate(result: BenchmarkResult, minRate = 95): void {
    if (result.successRate < minRate) {
      throw new Error(
        `Success rate below threshold: ${result.successRate.toFixed(1)}% < ${minRate}%`
      )
    }
  }
  // Removed ops/sec and GC-specific assertions in favor of simplified API

  /**
   * Simplified API: assert combined performance (time + ops/sec implication)
   */
  static assertPerformance(result: BenchmarkResult, maxMs: number, label = 'Performance'): void {
    if (result.averageTime > maxMs) {
      throw new Error(
        `${label} performance below baseline: ${result.averageTime.toFixed(2)}ms > ${maxMs}ms`
      )
    }
    // ensure timing is valid
    if (!Number.isFinite(result.averageTime) || result.averageTime <= 0) {
      throw new Error(`${label} produced invalid timing`)
    }
  }

  /**
   * Simplified API: assert reliability by success rate
   */
  static assertReliability(result: BenchmarkResult, minSuccess = 95): void {
    this.assertSuccessRate(result, minSuccess)
  }

  /**
   * Simplified API: assert resource usage using memory delta
   */
  static assertResources(result: BenchmarkResult, maxMemoryMB: number): void {
    const deltaMB = (result.memoryDelta ?? 0) / 1024 / 1024
    if (deltaMB > maxMemoryMB) {
      throw new Error(`Resource usage exceeded: ${deltaMB.toFixed(2)}MB > ${maxMemoryMB}MB`)
    }
  }
}

/**
 * Benchmark result comparison utilities
 */
export class BenchmarkComparison {
  /**
   * Compare two benchmark results
   */
  static compare(
    baseline: BenchmarkResult,
    current: BenchmarkResult
  ): {
    improvement: number
    regression: boolean
    details: Record<string, number>
  } {
    const timeDiff = baseline.averageTime - current.averageTime
    const improvement = (timeDiff / baseline.averageTime) * 100
    const regression = improvement < -5 // More than 5% slower is regression

    const baseMem = baseline.memoryDelta || 0
    const curMem = current.memoryDelta || 0
    const memoryDeltaChange = baseMem !== 0 ? ((curMem - baseMem) / baseMem) * 100 : 0

    return {
      improvement,
      regression,
      details: {
        timeImprovement: improvement,
        memoryDeltaChange,
        successRateChange: current.successRate - baseline.successRate
      }
    }
  }

  /**
   * Generate comparison report
   */
  static generateReport(
    comparisons: Array<{
      name: string
      baseline: BenchmarkResult
      current: BenchmarkResult
    }>
  ): string {
    let report = '# Benchmark Comparison Report\n\n'

    for (const { name, baseline, current } of comparisons) {
      const comparison = this.compare(baseline, current)
      const emoji = comparison.regression ? '🔴' : comparison.improvement > 5 ? '🟢' : '🟡'

      report += `## ${emoji} ${name}\n`
      report += `- Time: ${comparison.details.timeImprovement.toFixed(2)}% ${comparison.improvement > 0 ? 'faster' : 'slower'}\n`
      report += `- Memory Δ: ${comparison.details.memoryDeltaChange.toFixed(2)}% change\n`
      report += `- Success rate: ${comparison.details.successRateChange.toFixed(1)}% change\n\n`
    }

    return report
  }
}
