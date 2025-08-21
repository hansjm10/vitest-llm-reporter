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
  /** Whether to collect memory metrics */
  collectMemory: boolean
  /** Whether to collect GC metrics */
  collectGC: boolean
}

/**
 * Benchmark result
 */
export interface BenchmarkResult {
  /** Benchmark name */
  name: string
  /** Total execution time in ms */
  totalTime: number
  /** Average time per iteration in ms */
  averageTime: number
  /** Minimum time in ms */
  minTime: number
  /** Maximum time in ms */
  maxTime: number
  /** Standard deviation */
  standardDeviation: number
  /** Operations per second */
  operationsPerSecond: number
  /** Memory usage in bytes */
  memoryUsage: number
  /** Memory delta in bytes */
  memoryDelta: number
  /** Garbage collections count */
  gcCount: number
  /** Success rate as percentage */
  successRate: number
  /** Individual iteration times */
  iterations: number[]
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
  DEDUPLICATION_LATENCY: 100,
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
  collectMemory: true,
  collectGC: true
}

/**
 * Benchmark runner class
 */
export class BenchmarkRunner {
  private config: BenchmarkConfig
  private gcCount = 0
  private originalGCCallback?: () => void

  constructor(config: Partial<BenchmarkConfig> = {}) {
    this.config = { ...DEFAULT_BENCHMARK_CONFIG, ...config }
  }

  /**
   * Run a benchmark
   */
  async run(name: string, fn: () => Promise<void> | void): Promise<BenchmarkResult> {
    console.log(`🔄 Running benchmark: ${name}`)
    
    // Setup GC monitoring
    this.setupGCMonitoring()
    
    // Warmup
    await this.warmup(fn)
    
    // Collect baseline memory
    const baselineMemory = this.config.collectMemory ? this.getMemorySnapshot() : null
    const initialGCCount = this.gcCount
    
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
      } catch (error) {
        // Record failure but continue
        iterations.push(Number.MAX_SAFE_INTEGER)
      }
    }
    
    // Collect final memory
    const finalMemory = this.config.collectMemory ? this.getMemorySnapshot() : null
    const finalGCCount = this.gcCount
    
    // Cleanup GC monitoring
    this.cleanupGCMonitoring()
    
    // Calculate statistics
    const validIterations = iterations.filter(t => t !== Number.MAX_SAFE_INTEGER)
    const totalTime = validIterations.reduce((sum, time) => sum + time, 0)
    const averageTime = totalTime / validIterations.length
    const minTime = Math.min(...validIterations)
    const maxTime = Math.max(...validIterations)
    const variance = validIterations.reduce((sum, time) => sum + Math.pow(time - averageTime, 2), 0) / validIterations.length
    const standardDeviation = Math.sqrt(variance)
    const operationsPerSecond = averageTime > 0 ? 1000 / averageTime : 0
    const successRate = (successCount / this.config.iterations) * 100
    
    const result: BenchmarkResult = {
      name,
      totalTime,
      averageTime,
      minTime,
      maxTime,
      standardDeviation,
      operationsPerSecond,
      memoryUsage: finalMemory?.heapUsed ?? 0,
      memoryDelta: finalMemory && baselineMemory ? finalMemory.heapUsed - baselineMemory.heapUsed : 0,
      gcCount: finalGCCount - initialGCCount,
      successRate,
      iterations: validIterations
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
          reject(error)
        })
    })
  }
  
  /**
   * Setup garbage collection monitoring
   */
  private setupGCMonitoring(): void {
    if (!this.config.collectGC) return
    
    this.gcCount = 0
    if (global.gc && typeof global.gc === 'function') {
      // Simple GC counting - we'll just increment on manual calls
      // Note: This is a simplified approach for benchmarking
      const originalGC = global.gc
      global.gc = () => {
        this.gcCount++
        return originalGC()
      }
      this.originalGCCallback = originalGC
    }
  }
  
  /**
   * Cleanup garbage collection monitoring
   */
  private cleanupGCMonitoring(): void {
    if (this.originalGCCallback && global.gc) {
      global.gc = this.originalGCCallback as any
    }
  }
  
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
    console.log(`✅ ${result.name}:`)
    console.log(`   Average: ${result.averageTime.toFixed(2)}ms`)
    console.log(`   Min/Max: ${result.minTime.toFixed(2)}ms / ${result.maxTime.toFixed(2)}ms`)
    console.log(`   Ops/sec: ${result.operationsPerSecond.toFixed(2)}`)
    console.log(`   Success rate: ${result.successRate.toFixed(1)}%`)
    if (this.config.collectMemory) {
      console.log(`   Memory delta: ${(result.memoryDelta / 1024 / 1024).toFixed(2)}MB`)
    }
    if (this.config.collectGC) {
      console.log(`   GC count: ${result.gcCount}`)
    }
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
        errors: Math.random() > 0.9 ? [
          new Error(`Test error in ${id}`)
        ] : []
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
   * Generate large test suite (1000+ tests)
   */
  static generateLargeTestSuite(): Task[] {
    return this.generateTestSuite(1500)
  }
  
  /**
   * Generate test suite with failures
   */
  static generateFailingTestSuite(testCount: number, failureRate = 0.2): Task[] {
    const tests = this.generateTestSuite(testCount)
    
    // Force some tests to fail
    const failureCount = Math.floor(testCount * failureRate)
    for (let i = 0; i < failureCount; i++) {
      const test = tests[i]
      if (test.result) {
        test.result.state = 'fail'
        test.result.errors = [new Error(`Forced failure in test ${i}`)]
      }
    }
    
    return tests
  }
  
  /**
   * Generate test with heavy console output
   */
  static generateConsoleHeavyTest(outputLines = 1000): Task {
    const task = this.generateMockTask('console-heavy-test')
    
    // Simulate heavy console output (this would be captured by the reporter)
    const consoleData = Array.from({ length: outputLines }, (_, i) => 
      `Console output line ${i}: ${'x'.repeat(100)}`
    )
    
    // Add custom field to simulate console capture
    // Note: This would normally be handled by the console capture system
    ;(task as any).consoleOutput = consoleData
    
    return task
  }
  
  /**
   * Generate test with complex error stack traces
   */
  static generateComplexErrorTest(): Task {
    const task = this.generateMockTask('complex-error-test')
    
    if (task.result) {
      task.result.state = 'fail'
      task.result.errors = [
        new Error('Complex error with deep stack trace'),
        new Error('Another error for deduplication testing'),
        new Error('Third error with similar pattern')
      ]
      
      // Simulate stack traces
      task.result.errors.forEach((error, index) => {
        error.stack = `Error: ${error.message}\n` +
          Array.from({ length: 20 }, (_, i) => 
            `    at TestFunction${index}_${i} (/path/to/file${i}.ts:${i + 1}:${i + 10})`
          ).join('\n')
      })
    }
    
    return task
  }
  
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
  /**
   * Assert that result meets baseline metrics
   */
  static assertMeetsBaseline(result: BenchmarkResult, baseline: number, operation: string): void {
    if (result.averageTime > baseline) {
      throw new Error(
        `${operation} performance below baseline: ${result.averageTime.toFixed(2)}ms > ${baseline}ms`
      )
    }
  }
  
  /**
   * Assert memory usage is within limits
   */
  static assertMemoryWithinLimits(result: BenchmarkResult, limitMB = 100): void {
    const memoryMB = result.memoryUsage / 1024 / 1024
    if (memoryMB > limitMB) {
      throw new Error(
        `Memory usage exceeded limit: ${memoryMB.toFixed(2)}MB > ${limitMB}MB`
      )
    }
  }
  
  /**
   * Assert operations per second meets target
   */
  static assertOpsPerSecond(result: BenchmarkResult, target: number): void {
    if (result.operationsPerSecond < target) {
      throw new Error(
        `Operations per second below target: ${result.operationsPerSecond.toFixed(2)} < ${target}`
      )
    }
  }
  
  /**
   * Assert success rate is acceptable
   */
  static assertSuccessRate(result: BenchmarkResult, minRate = 95): void {
    if (result.successRate < minRate) {
      throw new Error(
        `Success rate below threshold: ${result.successRate.toFixed(1)}% < ${minRate}%`
      )
    }
  }
  
  /**
   * Assert GC count is reasonable
   */
  static assertGCCount(result: BenchmarkResult, maxCount = 10): void {
    if (result.gcCount > maxCount) {
      throw new Error(
        `Too many garbage collections: ${result.gcCount} > ${maxCount}`
      )
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
  static compare(baseline: BenchmarkResult, current: BenchmarkResult): {
    improvement: number
    regression: boolean
    details: Record<string, number>
  } {
    const timeDiff = baseline.averageTime - current.averageTime
    const improvement = (timeDiff / baseline.averageTime) * 100
    const regression = improvement < -5 // More than 5% slower is regression
    
    return {
      improvement,
      regression,
      details: {
        timeImprovement: improvement,
        opsImprovement: ((current.operationsPerSecond - baseline.operationsPerSecond) / baseline.operationsPerSecond) * 100,
        memoryChange: ((current.memoryUsage - baseline.memoryUsage) / baseline.memoryUsage) * 100,
        successRateChange: current.successRate - baseline.successRate
      }
    }
  }
  
  /**
   * Generate comparison report
   */
  static generateReport(comparisons: Array<{
    name: string
    baseline: BenchmarkResult
    current: BenchmarkResult
  }>): string {
    let report = '# Benchmark Comparison Report\n\n'
    
    for (const { name, baseline, current } of comparisons) {
      const comparison = this.compare(baseline, current)
      const emoji = comparison.regression ? '🔴' : comparison.improvement > 5 ? '🟢' : '🟡'
      
      report += `## ${emoji} ${name}\n`
      report += `- Time: ${comparison.details.timeImprovement.toFixed(2)}% ${comparison.improvement > 0 ? 'faster' : 'slower'}\n`
      report += `- Ops/sec: ${comparison.details.opsImprovement.toFixed(2)}% change\n`
      report += `- Memory: ${comparison.details.memoryChange.toFixed(2)}% change\n`
      report += `- Success rate: ${comparison.details.successRateChange.toFixed(1)}% change\n\n`
    }
    
    return report
  }
}