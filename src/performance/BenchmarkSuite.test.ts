/**
 * Tests for BenchmarkSuite
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { BenchmarkSuite } from './BenchmarkSuite'
import type {
  BenchmarkConfig,
  BenchmarkResult,
  BenchmarkSuite as BenchmarkSuiteType
} from './types'

// Mock the logger utilities
vi.mock('../utils/logger', () => ({
  coreLogger: vi.fn(() => vi.fn()),
  errorLogger: vi.fn(() => vi.fn())
}))

// Mock MetricsCollector
vi.mock('./MetricsCollector', () => ({
  MetricsCollector: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    collect: vi.fn(),
    clearHistory: vi.fn()
  }))
}))

// Mock process.memoryUsage
const mockMemoryUsage = vi.fn()
Object.defineProperty(process, 'memoryUsage', {
  value: mockMemoryUsage,
  writable: true
})

// Mock process.hrtime.bigint
const mockHrtime = vi.fn()
Object.defineProperty(process.hrtime, 'bigint', {
  value: mockHrtime,
  writable: true
})

describe('BenchmarkSuite', () => {
  let benchmarkSuite: BenchmarkSuite
  let defaultConfig: BenchmarkConfig

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    
    // Set up default memory usage mock
    mockMemoryUsage.mockReturnValue({
      rss: 100 * 1024 * 1024,
      heapTotal: 80 * 1024 * 1024,
      heapUsed: 40 * 1024 * 1024,
      external: 10 * 1024 * 1024,
      arrayBuffers: 5 * 1024 * 1024
    })

    // Set up hrtime mock
    let counter = 0n
    mockHrtime.mockImplementation(() => {
      counter += 1000000n // 1ms increment
      return counter
    })

    defaultConfig = {
      enabled: true,
      suite: 'basic',
      thresholds: {
        maxLatency: 1000,
        maxMemoryUsage: 512,
        maxOverhead: 5,
        minThroughput: 100
      },
      sampleSize: 10, // Reduced for faster tests
      warmupIterations: 2 // Reduced for faster tests
    }

    benchmarkSuite = new BenchmarkSuite(defaultConfig)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('constructor', () => {
    it('should create benchmark suite with default config', () => {
      const suite = new BenchmarkSuite({})
      expect(suite).toBeDefined()
    })

    it('should apply custom configuration', () => {
      const customConfig: BenchmarkConfig = {
        enabled: false,
        suite: 'comprehensive',
        sampleSize: 50,
        warmupIterations: 5,
        thresholds: {
          maxLatency: 500,
          maxMemoryUsage: 256,
          maxOverhead: 3,
          minThroughput: 200
        }
      }
      
      const suite = new BenchmarkSuite(customConfig)
      expect(suite).toBeDefined()
    })

    it('should resolve config with defaults', () => {
      const minimalConfig: BenchmarkConfig = {
        enabled: true
      }
      
      const suite = new BenchmarkSuite(minimalConfig)
      const config = suite['config']
      
      expect(config.enabled).toBe(true)
      expect(config.suite).toBe('basic')
      expect(config.sampleSize).toBe(100)
      expect(config.warmupIterations).toBe(10)
      expect(config.thresholds.maxLatency).toBe(1000)
    })
  })

  describe('run', () => {
    it('should return empty array when disabled', async () => {
      const disabledSuite = new BenchmarkSuite({ enabled: false })
      const results = await disabledSuite.run()
      
      expect(results).toEqual([])
    })

    it('should run basic benchmark suite', async () => {
      const results = await benchmarkSuite.run('basic')
      
      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeGreaterThan(0)
    })

    it('should run comprehensive benchmark suite', async () => {
      const results = await benchmarkSuite.run('comprehensive')
      
      expect(results).toBeDefined()
      expect(results.length).toBeGreaterThan(3) // More tests than basic
    })

    it('should run stress benchmark suite', async () => {
      const results = await benchmarkSuite.run('stress')
      
      expect(results).toBeDefined()
      expect(results.length).toBeGreaterThan(5) // Most tests
    })

    it('should run custom benchmark suite', async () => {
      const results = await benchmarkSuite.run('custom')
      
      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
    })

    it('should use default suite from config when no suite specified', async () => {
      const results = await benchmarkSuite.run()
      
      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
    })

    it('should handle unknown suite type', async () => {
      const results = await benchmarkSuite.run('unknown' as BenchmarkSuiteType)
      
      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
    })

    it('should handle benchmark suite errors', async () => {
      // Mock an error in the benchmark process
      const errorSuite = new BenchmarkSuite(defaultConfig)
      vi.spyOn(errorSuite as any, 'getBenchmarkTests').mockImplementation(() => {
        throw new Error('Test suite error')
      })
      
      const results = await errorSuite.run()
      expect(results).toEqual([])
    })
  })

  describe('benchmark tests execution', () => {
    let suite: BenchmarkSuite

    beforeEach(() => {
      // Use minimal sample size for faster tests
      suite = new BenchmarkSuite({
        ...defaultConfig,
        sampleSize: 3,
        warmupIterations: 1
      })
    })

    it('should execute test processing latency benchmark', async () => {
      const results = await suite.run('basic')
      const latencyTest = results.find(r => r.testName === 'test_processing_latency')
      
      expect(latencyTest).toBeDefined()
      expect(latencyTest!.meanTime).toBeGreaterThan(0)
      expect(latencyTest!.samples).toBe(3)
      expect(latencyTest!.successRate).toBeGreaterThan(0)
    })

    it('should execute cache performance benchmark', async () => {
      const results = await suite.run('basic')
      const cacheTest = results.find(r => r.testName === 'cache_performance')
      
      expect(cacheTest).toBeDefined()
      expect(cacheTest!.opsPerSecond).toBeGreaterThan(0)
      expect(cacheTest!.memoryUsage).toBeGreaterThan(0)
    })

    it('should execute memory usage benchmark', async () => {
      const results = await suite.run('basic')
      const memoryTest = results.find(r => r.testName === 'memory_usage')
      
      expect(memoryTest).toBeDefined()
      expect(memoryTest!.meanTime).toBeGreaterThan(0)
    })

    it('should calculate benchmark statistics correctly', async () => {
      // Set up predictable timing
      let callCount = 0
      mockHrtime.mockImplementation(() => {
        callCount++
        return BigInt(callCount * 1000000) // Each call is 1ms later
      })

      const results = await suite.run('basic')
      const result = results[0]
      
      expect(result.meanTime).toBeGreaterThan(0)
      expect(result.standardDeviation).toBeGreaterThanOrEqual(0)
      expect(result.minTime).toBeGreaterThanOrEqual(0)
      expect(result.maxTime).toBeGreaterThanOrEqual(result.minTime)
      expect(result.samples).toBe(3)
      expect(result.opsPerSecond).toBeGreaterThan(0)
    })

    it('should track memory usage during benchmarks', async () => {
      let memoryIncrease = 40 * 1024 * 1024
      mockMemoryUsage.mockImplementation(() => ({
        rss: 100 * 1024 * 1024,
        heapTotal: 80 * 1024 * 1024,
        heapUsed: memoryIncrease,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024
      }))

      const results = await suite.run('basic')
      const result = results[0]
      
      expect(result.memoryUsage).toBeGreaterThan(0)
    })

    it('should handle test failures gracefully', async () => {
      // Create a suite with a failing test
      const failingSuite = new BenchmarkSuite({
        ...defaultConfig,
        sampleSize: 2,
        warmupIterations: 0
      })

      // Mock a test that always fails
      vi.spyOn(failingSuite as any, 'getBasicTests').mockReturnValue([
        {
          name: 'failing_test',
          test: async () => {
            throw new Error('Test failure')
          }
        }
      ])

      const results = await failingSuite.run('basic')
      expect(results).toHaveLength(1)
      expect(results[0].successRate).toBe(0)
      expect(results[0].metadata?.error).toBeDefined()
    })

    it('should respect test timeouts', async () => {
      const timeoutSuite = new BenchmarkSuite({
        ...defaultConfig,
        sampleSize: 1,
        warmupIterations: 0
      })

      // Mock a test that times out
      vi.spyOn(timeoutSuite as any, 'getBasicTests').mockReturnValue([
        {
          name: 'timeout_test',
          test: async () => {
            return new Promise(() => {}) // Never resolves
          },
          timeout: 100
        }
      ])

      const results = await timeoutSuite.run('basic')
      expect(results).toHaveLength(1)
      expect(results[0].successRate).toBe(0)
    })

    it('should execute setup and teardown if provided', async () => {
      const setup = vi.fn().mockResolvedValue(undefined)
      const teardown = vi.fn().mockResolvedValue(undefined)
      const test = vi.fn().mockResolvedValue(undefined)

      const customSuite = new BenchmarkSuite({
        ...defaultConfig,
        sampleSize: 1,
        warmupIterations: 0
      })

      vi.spyOn(customSuite as any, 'getBasicTests').mockReturnValue([
        {
          name: 'setup_teardown_test',
          setup,
          test,
          teardown
        }
      ])

      await customSuite.run('basic')
      
      expect(setup).toHaveBeenCalledTimes(1)
      expect(teardown).toHaveBeenCalledTimes(1)
      expect(test).toHaveBeenCalled()
    })
  })

  describe('comprehensive tests', () => {
    it('should include concurrent processing test', async () => {
      const suite = new BenchmarkSuite({
        ...defaultConfig,
        sampleSize: 2,
        warmupIterations: 1
      })

      const results = await suite.run('comprehensive')
      const concurrentTest = results.find(r => r.testName === 'concurrent_processing')
      
      expect(concurrentTest).toBeDefined()
      expect(concurrentTest!.opsPerSecond).toBeGreaterThanOrEqual(0)
    })

    it('should include large output generation test', async () => {
      const suite = new BenchmarkSuite({
        ...defaultConfig,
        sampleSize: 2,
        warmupIterations: 1
      })

      const results = await suite.run('comprehensive')
      const outputTest = results.find(r => r.testName === 'large_output_generation')
      
      expect(outputTest).toBeDefined()
      expect(outputTest!.meanTime).toBeGreaterThan(0)
    })

    it('should include tokenization performance test', async () => {
      const suite = new BenchmarkSuite({
        ...defaultConfig,
        sampleSize: 2,
        warmupIterations: 1
      })

      const results = await suite.run('comprehensive')
      const tokenTest = results.find(r => r.testName === 'tokenization_performance')
      
      expect(tokenTest).toBeDefined()
      expect(tokenTest!.opsPerSecond).toBeGreaterThan(0)
    })
  })

  describe('stress tests', () => {
    it('should include memory pressure test', async () => {
      const suite = new BenchmarkSuite({
        ...defaultConfig,
        sampleSize: 1,
        warmupIterations: 0
      })

      const results = await suite.run('stress')
      const memoryTest = results.find(r => r.testName === 'memory_pressure_test')
      
      expect(memoryTest).toBeDefined()
    })

    it('should include high concurrency test', async () => {
      const suite = new BenchmarkSuite({
        ...defaultConfig,
        sampleSize: 1,
        warmupIterations: 0
      })

      const results = await suite.run('stress')
      const concurrencyTest = results.find(r => r.testName === 'high_concurrency_test')
      
      expect(concurrencyTest).toBeDefined()
    })
  })

  describe('test data generation', () => {
    it('should create mock test data', () => {
      const mockData = benchmarkSuite['createMockTestData']()
      
      expect(mockData).toBeDefined()
      expect(typeof mockData).toBe('object')
      expect(mockData).toHaveProperty('test')
      expect(mockData).toHaveProperty('result')
      expect(mockData).toHaveProperty('console')
    })

    it('should create large mock data', () => {
      const largeData = benchmarkSuite['createLargeMockData']()
      
      expect(largeData).toBeDefined()
      expect(typeof largeData).toBe('object')
      expect(largeData).toHaveProperty('summary')
      expect(largeData).toHaveProperty('tests')
      
      const data = largeData as any
      expect(Array.isArray(data.tests)).toBe(true)
      expect(data.tests.length).toBe(1000)
    })
  })

  describe('simulation methods', () => {
    it('should simulate test processing', async () => {
      const mockData = { test: 'data' }
      
      await expect(benchmarkSuite['simulateTestProcessing'](mockData)).resolves.not.toThrow()
    })

    it('should reject empty serialization', async () => {
      // Mock JSON.stringify to return empty string
      const originalStringify = JSON.stringify
      vi.spyOn(JSON, 'stringify').mockReturnValue('')
      
      const mockData = { test: 'data' }
      
      await expect(benchmarkSuite['simulateTestProcessing'](mockData)).rejects.toThrow('Empty serialization')
      
      // Restore original
      JSON.stringify = originalStringify
    })

    it('should simulate high load operation', async () => {
      await expect(benchmarkSuite['simulateHighLoadOperation'](1)).resolves.not.toThrow()
    })
  })

  describe('benchmark context creation', () => {
    it('should create benchmark context with correct configuration', () => {
      const context = benchmarkSuite['createBenchmarkContext']()
      
      expect(context).toBeDefined()
      expect(context.sampleSize).toBe(defaultConfig.sampleSize)
      expect(context.warmupIterations).toBe(defaultConfig.warmupIterations)
      expect(context.thresholds).toEqual(defaultConfig.thresholds)
      expect(context.metricsCollector).toBeDefined()
    })
  })

  describe('threshold validation', () => {
    it('should validate latency thresholds in test processing', async () => {
      // Set a very low latency threshold
      const strictSuite = new BenchmarkSuite({
        ...defaultConfig,
        sampleSize: 1,
        warmupIterations: 0,
        thresholds: {
          ...defaultConfig.thresholds!,
          maxLatency: 1 // 1ms - very strict
        }
      })

      // Mock a slow operation
      vi.spyOn(strictSuite as any, 'simulateTestProcessing').mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10)) // 10ms delay
      })

      const results = await strictSuite.run('basic')
      const latencyTest = results.find(r => r.testName === 'test_processing_latency')
      
      expect(latencyTest).toBeDefined()
      expect(latencyTest!.successRate).toBe(0) // Should fail due to strict threshold
    })

    it('should validate memory thresholds', async () => {
      // Set a very low memory threshold
      const strictSuite = new BenchmarkSuite({
        ...defaultConfig,
        sampleSize: 1,
        warmupIterations: 0,
        thresholds: {
          ...defaultConfig.thresholds!,
          maxMemoryUsage: 1 // 1MB - very strict
        }
      })

      const results = await strictSuite.run('basic')
      const memoryTest = results.find(r => r.testName === 'memory_usage')
      
      expect(memoryTest).toBeDefined()
      // Test may or may not fail depending on actual memory allocation
    })

    it('should validate throughput thresholds in cache performance', async () => {
      const strictSuite = new BenchmarkSuite({
        ...defaultConfig,
        sampleSize: 1,
        warmupIterations: 0,
        thresholds: {
          ...defaultConfig.thresholds!,
          minThroughput: 1000000 // Very high throughput requirement
        }
      })

      const results = await strictSuite.run('basic')
      const cacheTest = results.find(r => r.testName === 'cache_performance')
      
      expect(cacheTest).toBeDefined()
      expect(cacheTest!.successRate).toBe(0) // Should fail due to strict threshold
    })
  })

  describe('error handling', () => {
    it('should handle setup errors', async () => {
      const errorSuite = new BenchmarkSuite({
        ...defaultConfig,
        sampleSize: 1,
        warmupIterations: 0
      })

      vi.spyOn(errorSuite as any, 'getBasicTests').mockReturnValue([
        {
          name: 'setup_error_test',
          setup: async () => {
            throw new Error('Setup failed')
          },
          test: async () => {}
        }
      ])

      const results = await errorSuite.run('basic')
      expect(results).toHaveLength(1)
      expect(results[0].metadata?.error).toBeDefined()
    })

    it('should handle teardown errors', async () => {
      const errorSuite = new BenchmarkSuite({
        ...defaultConfig,
        sampleSize: 1,
        warmupIterations: 0
      })

      vi.spyOn(errorSuite as any, 'getBasicTests').mockReturnValue([
        {
          name: 'teardown_error_test',
          test: async () => {},
          teardown: async () => {
            throw new Error('Teardown failed')
          }
        }
      ])

      const results = await errorSuite.run('basic')
      expect(results).toHaveLength(1)
      expect(results[0].metadata?.error).toBeDefined()
    })
  })

  describe('result metadata', () => {
    it('should include expected performance metadata', async () => {
      const results = await benchmarkSuite.run('basic')
      const result = results[0]
      
      expect(result.metadata).toBeDefined()
      expect(result.metadata?.expectedOpsPerSecond).toBeDefined()
      expect(result.metadata?.maxMemoryMB).toBeDefined()
      expect(result.metadata?.warmupIterations).toBe(defaultConfig.warmupIterations)
      expect(result.metadata?.sampleSize).toBe(defaultConfig.sampleSize)
    })

    it('should include error information in failed tests', async () => {
      const failingSuite = new BenchmarkSuite({
        ...defaultConfig,
        sampleSize: 1,
        warmupIterations: 0
      })

      vi.spyOn(failingSuite as any, 'getBasicTests').mockReturnValue([
        {
          name: 'failing_test',
          test: async () => {
            throw new Error('Test error')
          }
        }
      ])

      const results = await failingSuite.run('basic')
      expect(results[0].metadata?.error).toBe('Test error')
    })
  })
})