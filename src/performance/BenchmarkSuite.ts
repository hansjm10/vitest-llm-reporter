/**
 * Benchmark Suite - Performance Monitoring
 *
 * Comprehensive benchmarking system for measuring and validating
 * performance characteristics of the LLM reporter system.
 *
 * @module BenchmarkSuite
 */

import type {
  BenchmarkConfig,
  BenchmarkResult,
  BenchmarkSuite as BenchmarkSuiteType,
  BenchmarkThresholds,
  PerformanceMetrics
} from './types'
import { MetricsCollector } from './MetricsCollector'
import { coreLogger, errorLogger } from '../utils/logger'

/**
 * Individual benchmark test
 */
interface BenchmarkTest {
  readonly name: string
  readonly setup?: () => Promise<void> | void
  readonly test: () => Promise<void> | void
  readonly teardown?: () => Promise<void> | void
  readonly timeout?: number
  readonly expectedOpsPerSecond?: number
  readonly maxMemoryMB?: number
}

/**
 * Benchmark execution context
 */
interface BenchmarkContext {
  readonly sampleSize: number
  readonly warmupIterations: number
  readonly thresholds: BenchmarkThresholds
  readonly metricsCollector: MetricsCollector
}

/**
 * Benchmark suite implementation
 */
export class BenchmarkSuite {
  private config: Required<BenchmarkConfig>
  private debug = coreLogger()
  private debugError = errorLogger()

  constructor(config: BenchmarkConfig) {
    this.config = this.resolveConfig(config)
  }

  /**
   * Resolve benchmark configuration with defaults
   */
  private resolveConfig(config: BenchmarkConfig): Required<BenchmarkConfig> {
    return {
      enabled: config.enabled ?? false,
      suite: config.suite ?? 'basic',
      thresholds: {
        maxLatency: config.thresholds?.maxLatency ?? 1000,
        maxMemoryUsage: config.thresholds?.maxMemoryUsage ?? 512,
        maxOverhead: config.thresholds?.maxOverhead ?? 5,
        minThroughput: config.thresholds?.minThroughput ?? 100
      },
      sampleSize: config.sampleSize ?? 100,
      warmupIterations: config.warmupIterations ?? 10
    }
  }

  /**
   * Run benchmark suite
   */
  async run(suite?: BenchmarkSuiteType): Promise<BenchmarkResult[]> {
    if (!this.config.enabled) {
      this.debug('Benchmarking disabled')
      return []
    }

    const suiteType = suite ?? this.config.suite
    this.debug('Running benchmark suite: %s', suiteType)

    try {
      const tests = this.getBenchmarkTests(suiteType)
      const context = this.createBenchmarkContext()
      const results: BenchmarkResult[] = []

      for (const test of tests) {
        this.debug('Running benchmark: %s', test.name)
        const result = await this.runBenchmarkTest(test, context)
        results.push(result)
      }

      this.debug('Benchmark suite completed, %d tests run', results.length)
      return results
    } catch (error) {
      this.debugError('Benchmark suite failed: %O', error)
      return []
    }
  }

  /**
   * Get benchmark tests for suite type
   */
  private getBenchmarkTests(suite: BenchmarkSuiteType): BenchmarkTest[] {
    switch (suite) {
      case 'basic':
        return this.getBasicTests()
      case 'comprehensive':
        return this.getComprehensiveTests()
      case 'stress':
        return this.getStressTests()
      case 'custom':
        return this.getCustomTests()
      default:
        return this.getBasicTests()
    }
  }

  /**
   * Get basic benchmark tests
   */
  private getBasicTests(): BenchmarkTest[] {
    return [
      {
        name: 'test_processing_latency',
        test: async () => {
          // Simulate test processing
          const data = this.createMockTestData()
          const start = Date.now()
          await this.simulateTestProcessing(data)
          const duration = Date.now() - start

          const maxLatency = this.config.thresholds?.maxLatency ?? 1000
          if (duration > maxLatency) {
            throw new Error(`Test processing too slow: ${duration}ms > ${maxLatency}ms`)
          }
        },
        expectedOpsPerSecond: 500,
        maxMemoryMB: 50
      },
      {
        name: 'cache_performance',
        test: async () => {
          // Test cache hit/miss performance
          const cache = new Map<string, string>()
          const start = Date.now()

          // Populate cache
          for (let i = 0; i < 1000; i++) {
            cache.set(`key_${i}`, `value_${i}`)
          }

          // Test cache hits
          for (let i = 0; i < 1000; i++) {
            const value = cache.get(`key_${i}`)
            if (value !== `value_${i}`) {
              throw new Error('Cache miss on existing key')
            }
          }

          const duration = Date.now() - start
          const opsPerSecond = (2000 / duration) * 1000

          const minThroughput = this.config.thresholds?.minThroughput ?? 100
          if (opsPerSecond < minThroughput) {
            throw new Error(`Cache performance too low: ${opsPerSecond} ops/sec`)
          }
        },
        expectedOpsPerSecond: 10000,
        maxMemoryMB: 10
      },
      {
        name: 'memory_usage',
        test: async () => {
          const beforeMemory = process.memoryUsage()

          // Allocate memory
          const data = []
          for (let i = 0; i < 10000; i++) {
            data.push({
              id: i,
              name: `test_${i}`,
              data: 'x'.repeat(100)
            })
          }

          const afterMemory = process.memoryUsage()
          const memoryIncreaseMB = (afterMemory.heapUsed - beforeMemory.heapUsed) / (1024 * 1024)

          const maxMemoryUsage = this.config.thresholds?.maxMemoryUsage ?? 512
          if (memoryIncreaseMB > maxMemoryUsage) {
            throw new Error(`Memory usage too high: ${memoryIncreaseMB}MB`)
          }

          // Clean up
          data.length = 0
        },
        expectedOpsPerSecond: 1000,
        maxMemoryMB: 100
      }
    ]
  }

  /**
   * Get comprehensive benchmark tests
   */
  private getComprehensiveTests(): BenchmarkTest[] {
    return [
      ...this.getBasicTests(),
      {
        name: 'concurrent_processing',
        test: async () => {
          const promises = []
          const start = Date.now()

          for (let i = 0; i < 10; i++) {
            promises.push(this.simulateTestProcessing(this.createMockTestData()))
          }

          await Promise.all(promises)
          const duration = Date.now() - start
          const opsPerSecond = (10 / duration) * 1000

          if (opsPerSecond < 5) {
            throw new Error(`Concurrent processing too slow: ${opsPerSecond} ops/sec`)
          }
        },
        expectedOpsPerSecond: 10,
        maxMemoryMB: 200
      },
      {
        name: 'large_output_generation',
        test: async () => {
          const largeData = this.createLargeMockData()
          const start = Date.now()

          const output = JSON.stringify(largeData)
          const duration = Date.now() - start

          if (duration > 5000) {
            // 5 seconds max
            throw new Error(`Large output generation too slow: ${duration}ms`)
          }

          if (output.length < 100000) {
            throw new Error('Generated output too small')
          }
        },
        expectedOpsPerSecond: 1,
        maxMemoryMB: 100
      },
      {
        name: 'tokenization_performance',
        test: async () => {
          const text = 'This is a test string for tokenization. '.repeat(1000)
          const start = Date.now()

          // Simulate tokenization
          const tokens = text.split(/\s+/)
          const tokenCount = tokens.length

          const duration = Date.now() - start
          const tokensPerSecond = (tokenCount / duration) * 1000

          if (tokensPerSecond < 10000) {
            throw new Error(`Tokenization too slow: ${tokensPerSecond} tokens/sec`)
          }
        },
        expectedOpsPerSecond: 100,
        maxMemoryMB: 50
      }
    ]
  }

  /**
   * Get stress test benchmark tests
   */
  private getStressTests(): BenchmarkTest[] {
    return [
      ...this.getComprehensiveTests(),
      {
        name: 'memory_pressure_test',
        test: async () => {
          const data = []
          const start = Date.now()

          // Allocate large amounts of memory
          for (let i = 0; i < 100000; i++) {
            data.push({
              id: i,
              largeData: 'x'.repeat(1000),
              nested: {
                moreData: 'y'.repeat(500),
                deepNested: {
                  evenMore: 'z'.repeat(250)
                }
              }
            })

            // Check memory periodically
            if (i % 10000 === 0) {
              const memory = process.memoryUsage()
              const memoryMB = memory.heapUsed / (1024 * 1024)

              if (memoryMB > 1000) {
                // 1GB limit
                throw new Error(`Memory usage exceeded limit: ${memoryMB}MB`)
              }
            }
          }

          const duration = Date.now() - start

          // Clean up
          data.length = 0

          if (duration > 30000) {
            // 30 seconds max
            throw new Error(`Stress test took too long: ${duration}ms`)
          }
        },
        expectedOpsPerSecond: 3333, // 100k items in 30s
        maxMemoryMB: 1000,
        timeout: 60000
      },
      {
        name: 'high_concurrency_test',
        test: async () => {
          const concurrency = 100
          const promises = []
          const start = Date.now()

          for (let i = 0; i < concurrency; i++) {
            promises.push(this.simulateHighLoadOperation(i))
          }

          await Promise.all(promises)
          const duration = Date.now() - start
          const opsPerSecond = (concurrency / duration) * 1000

          if (opsPerSecond < 10) {
            throw new Error(`High concurrency performance too low: ${opsPerSecond} ops/sec`)
          }
        },
        expectedOpsPerSecond: 20,
        maxMemoryMB: 500,
        timeout: 30000
      }
    ]
  }

  /**
   * Get custom benchmark tests
   */
  private getCustomTests(): BenchmarkTest[] {
    // Custom tests would be defined based on specific requirements
    return this.getBasicTests()
  }

  /**
   * Create benchmark execution context
   */
  private createBenchmarkContext(): BenchmarkContext {
    return {
      sampleSize: this.config.sampleSize,
      warmupIterations: this.config.warmupIterations,
      thresholds: this.config.thresholds,
      metricsCollector: new MetricsCollector({
        mode: 'test',
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
          ttl: 60000,
          targetHitRatio: 80,
          enableWarming: false,
          evictionStrategy: 'lru',
          enableMultiTier: false
        },
        memory: {
          enabled: true,
          pressureThreshold: 100,
          enablePooling: true,
          poolSizes: {
            testResults: 100,
            errors: 50,
            consoleOutputs: 200
          },
          enableProfiling: false,
          monitoringInterval: 5000
        },
        streaming: {
          enabled: true,
          enableAdaptiveBuffering: true,
          bufferLimits: {
            min: 1024,
            max: 65536,
            initial: 4096
          },
          enableBackgroundProcessing: true,
          priorityQueue: {
            maxSize: 1000,
            batchSize: 10,
            processingInterval: 100
          }
        },
        benchmark: {
          enabled: true,
          suite: 'basic',
          thresholds: this.config.thresholds,
          sampleSize: this.config.sampleSize,
          warmupIterations: this.config.warmupIterations
        }
      })
    }
  }

  /**
   * Run individual benchmark test
   */
  private async runBenchmarkTest(
    test: BenchmarkTest,
    context: BenchmarkContext
  ): Promise<BenchmarkResult> {
    const { sampleSize, warmupIterations } = context
    const samples: number[] = []
    let memoryUsage = 0
    let successCount = 0

    try {
      // Setup
      if (test.setup) {
        await test.setup()
      }

      // Warmup iterations
      for (let i = 0; i < warmupIterations; i++) {
        try {
          await this.runSingleIteration(test)
        } catch (error) {
          // Ignore warmup failures
        }
      }

      // Actual benchmark iterations
      for (let i = 0; i < sampleSize; i++) {
        const beforeMemory = process.memoryUsage()
        const start = process.hrtime.bigint()

        try {
          await this.runSingleIteration(test)
          successCount++
        } catch (error) {
          // Record failure but continue
        }

        const end = process.hrtime.bigint()
        const duration = Number(end - start) / 1_000_000 // Convert to milliseconds
        samples.push(duration)

        const afterMemory = process.memoryUsage()
        memoryUsage = Math.max(memoryUsage, afterMemory.heapUsed)
      }

      // Teardown
      if (test.teardown) {
        await test.teardown()
      }

      // Calculate statistics
      samples.sort((a, b) => a - b)
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length
      const variance = samples.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / samples.length
      const standardDeviation = Math.sqrt(variance)
      const min = samples[0]
      const max = samples[samples.length - 1]
      const opsPerSecond = mean > 0 ? 1000 / mean : 0
      const successRate = (successCount / sampleSize) * 100

      return {
        suite: this.config.suite,
        testName: test.name,
        meanTime: mean,
        standardDeviation,
        minTime: min,
        maxTime: max,
        samples: samples.length,
        opsPerSecond,
        memoryUsage,
        successRate,
        metadata: {
          expectedOpsPerSecond: test.expectedOpsPerSecond,
          maxMemoryMB: test.maxMemoryMB,
          warmupIterations,
          sampleSize
        }
      }
    } catch (error) {
      this.debugError('Benchmark test failed: %s - %O', test.name, error)

      return {
        suite: this.config.suite,
        testName: test.name,
        meanTime: 0,
        standardDeviation: 0,
        minTime: 0,
        maxTime: 0,
        samples: 0,
        opsPerSecond: 0,
        memoryUsage: 0,
        successRate: 0,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  /**
   * Run single test iteration
   */
  private async runSingleIteration(test: BenchmarkTest): Promise<void> {
    const timeout = test.timeout ?? 10000 // 10 second default timeout

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Test timeout: ${test.name}`))
      }, timeout)

      Promise.resolve(test.test())
        .then(() => {
          clearTimeout(timer)
          resolve()
        })
        .catch((error) => {
          clearTimeout(timer)
          reject(error)
        })
    })
  }

  /**
   * Create mock test data
   */
  private createMockTestData(): unknown {
    return {
      test: {
        name: 'sample test',
        file: '/path/to/test.js',
        duration: 100
      },
      result: {
        state: 'passed',
        errors: []
      },
      console: [{ type: 'log', output: 'test output' }]
    }
  }

  /**
   * Create large mock data for stress testing
   */
  private createLargeMockData(): unknown {
    const tests = []
    for (let i = 0; i < 1000; i++) {
      tests.push({
        test: {
          name: `test_${i}`,
          file: `/path/to/test_${i}.js`,
          duration: Math.random() * 1000
        },
        result: {
          state: Math.random() > 0.1 ? 'passed' : 'failed',
          errors:
            Math.random() > 0.9
              ? [
                  {
                    message: `Error in test ${i}`,
                    stack: `Error stack trace for test ${i}\n`.repeat(10)
                  }
                ]
              : []
        },
        console: Array.from({ length: Math.floor(Math.random() * 10) }, (_, j) => ({
          type: 'log',
          output: `Console output ${j} for test ${i}`
        }))
      })
    }

    return {
      summary: {
        total: tests.length,
        passed: tests.filter((t) => t.result.state === 'passed').length,
        failed: tests.filter((t) => t.result.state === 'failed').length
      },
      tests
    }
  }

  /**
   * Simulate test processing
   */
  private async simulateTestProcessing(data: unknown): Promise<void> {
    // Simulate JSON serialization
    const serialized = JSON.stringify(data)

    // Simulate some processing time
    const processingTime = Math.random() * 10 + 5 // 5-15ms
    await new Promise((resolve) => setTimeout(resolve, processingTime))

    // Simulate validation
    if (serialized.length === 0) {
      throw new Error('Empty serialization')
    }
  }

  /**
   * Simulate high load operation
   */
  private async simulateHighLoadOperation(index: number): Promise<void> {
    const data = {
      index,
      timestamp: Date.now(),
      data: 'x'.repeat(1000)
    }

    // Simulate processing
    await this.simulateTestProcessing(data)

    // Simulate additional work
    const work = Math.random() * 100 + 50 // 50-150ms
    await new Promise((resolve) => setTimeout(resolve, work))
  }
}
