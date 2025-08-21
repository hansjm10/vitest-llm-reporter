/**
 * Reporter Performance Benchmarks
 * 
 * Benchmarks for the LLM reporter performance including test processing,
 * output generation, file operations, and overall reporter lifecycle.
 * 
 * @module ReporterBenchmarks
 */

import { describe, it, expect } from 'vitest'
import { LLMReporter } from '../../src/reporter/reporter'
import { 
  BenchmarkRunner, 
  TestDataGenerator, 
  PerformanceAssertions,
  BASELINE_METRICS 
} from './utils'
import type { Task } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unlink } from 'node:fs/promises'

describe('Reporter Performance Benchmarks', () => {
  const runner = new BenchmarkRunner({
    iterations: 50,
    warmupIterations: 5,
    timeout: 5000
  })
  
  let tempFiles: string[] = []
  
  // Cleanup temp files after tests
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
  
  describe('Basic Reporter Operations', () => {
    it('should process single test efficiently', async () => {
      const task = TestDataGenerator.generateMockTask()
      
      const result = await runner.run('reporter_single_test', async () => {
        const outputFile = join(tmpdir(), `bench-single-${Date.now()}.json`)
        tempFiles.push(outputFile)
        
        const reporter = new LLMReporter({
          outputFile,
          verbose: false,
          includePassedTests: true
        })
        
        // Simulate reporter lifecycle
        reporter.onInit({} as any)
        await reporter.onFinished([task])
      })
      
      // Assertions
      PerformanceAssertions.assertMeetsBaseline(
        result, 
        BASELINE_METRICS.REPORTER_BASIC_LATENCY, 
        'Single test processing'
      )
      PerformanceAssertions.assertOpsPerSecond(result, BASELINE_METRICS.OPS_PER_SECOND.REPORTER)
      PerformanceAssertions.assertSuccessRate(result, 98)
      
      expect(result.successRate).toBeGreaterThan(95)
      expect(result.averageTime).toBeLessThan(BASELINE_METRICS.REPORTER_BASIC_LATENCY)
    })
    
    it('should handle small test suite (10 tests) efficiently', async () => {
      const tasks = TestDataGenerator.generateTestSuite(10)
      
      const result = await runner.run('reporter_small_suite', async () => {
        const outputFile = join(tmpdir(), `bench-small-${Date.now()}.json`)
        tempFiles.push(outputFile)
        
        const reporter = new LLMReporter({
          outputFile,
          verbose: false,
          includePassedTests: true
        })
        
        reporter.onInit({} as any)
        await reporter.onFinished(tasks)
      })
      
      PerformanceAssertions.assertMeetsBaseline(result, 200, 'Small suite processing')
      PerformanceAssertions.assertOpsPerSecond(result, 25)
      PerformanceAssertions.assertMemoryWithinLimits(result, 50)
      
      expect(result.successRate).toBeGreaterThan(95)
    })
    
    it('should handle medium test suite (100 tests) efficiently', async () => {
      const tasks = TestDataGenerator.generateTestSuite(100)
      
      const result = await runner.run('reporter_medium_suite', async () => {
        const outputFile = join(tmpdir(), `bench-medium-${Date.now()}.json`)
        tempFiles.push(outputFile)
        
        const reporter = new LLMReporter({
          outputFile,
          verbose: false,
          includePassedTests: true
        })
        
        reporter.onInit({} as any)
        await reporter.onFinished(tasks)
      })
      
      PerformanceAssertions.assertMeetsBaseline(result, 1000, 'Medium suite processing')
      PerformanceAssertions.assertOpsPerSecond(result, 5)
      PerformanceAssertions.assertMemoryWithinLimits(result, 75)
      
      expect(result.successRate).toBeGreaterThan(95)
    })
  })
  
  describe('Reporter Configuration Impact', () => {
    it('should benchmark verbose mode performance', async () => {
      const tasks = TestDataGenerator.generateTestSuite(50)
      
      const verboseResult = await runner.run('reporter_verbose_mode', async () => {
        const outputFile = join(tmpdir(), `bench-verbose-${Date.now()}.json`)
        tempFiles.push(outputFile)
        
        const reporter = new LLMReporter({
          outputFile,
          verbose: true,
          includePassedTests: true,
          includeSkippedTests: true
        })
        
        reporter.onInit({} as any)
        await reporter.onFinished(tasks)
      })
      
      const simpleResult = await runner.run('reporter_simple_mode', async () => {
        const outputFile = join(tmpdir(), `bench-simple-${Date.now()}.json`)
        tempFiles.push(outputFile)
        
        const reporter = new LLMReporter({
          outputFile,
          verbose: false,
          includePassedTests: false
        })
        
        reporter.onInit({} as any)
        await reporter.onFinished(tasks)
      })
      
      // Verbose mode should be slower but not dramatically
      expect(verboseResult.averageTime).toBeGreaterThan(simpleResult.averageTime)
      expect(verboseResult.averageTime).toBeLessThan(simpleResult.averageTime * 3) // Max 3x slower
      
      PerformanceAssertions.assertSuccessRate(verboseResult, 95)
      PerformanceAssertions.assertSuccessRate(simpleResult, 95)
    })
    
    it('should benchmark truncation mode performance', async () => {
      const tasks = TestDataGenerator.generateTestSuite(50)
      
      const truncationResult = await runner.run('reporter_truncation_mode', async () => {
        const outputFile = join(tmpdir(), `bench-truncation-${Date.now()}.json`)
        tempFiles.push(outputFile)
        
        const reporter = new LLMReporter({
          outputFile,
          verbose: true,
          truncationEnabled: true,
          maxTokens: 5000
        })
        
        reporter.onInit({} as any)
        await reporter.onFinished(tasks)
      })
      
      const noTruncationResult = await runner.run('reporter_no_truncation', async () => {
        const outputFile = join(tmpdir(), `bench-no-truncation-${Date.now()}.json`)
        tempFiles.push(outputFile)
        
        const reporter = new LLMReporter({
          outputFile,
          verbose: true,
          truncationEnabled: false
        })
        
        reporter.onInit({} as any)
        await reporter.onFinished(tasks)
      })
      
      // Truncation should be faster due to reduced processing
      expect(truncationResult.averageTime).toBeLessThan(noTruncationResult.averageTime)
      
      PerformanceAssertions.assertSuccessRate(truncationResult, 95)
      PerformanceAssertions.assertSuccessRate(noTruncationResult, 95)
    })
  })
  
  describe('Error Handling Performance', () => {
    it('should handle failing tests efficiently', async () => {
      const tasks = TestDataGenerator.generateFailingTestSuite(50, 0.5) // 50% failure rate
      
      const result = await runner.run('reporter_failing_tests', async () => {
        const outputFile = join(tmpdir(), `bench-failing-${Date.now()}.json`)
        tempFiles.push(outputFile)
        
        const reporter = new LLMReporter({
          outputFile,
          verbose: true,
          includePassedTests: true
        })
        
        reporter.onInit({} as any)
        await reporter.onFinished(tasks)
      })
      
      // Should handle failures without significant performance impact
      PerformanceAssertions.assertMeetsBaseline(result, 1500, 'Failing tests processing')
      PerformanceAssertions.assertSuccessRate(result, 95)
      PerformanceAssertions.assertMemoryWithinLimits(result, 100)
      
      expect(result.averageTime).toBeLessThan(1500)
    })
    
    it('should handle complex error tests efficiently', async () => {
      const tasks = Array.from({ length: 20 }, () => 
        TestDataGenerator.generateComplexErrorTest()
      )
      
      const result = await runner.run('reporter_complex_errors', async () => {
        const outputFile = join(tmpdir(), `bench-complex-errors-${Date.now()}.json`)
        tempFiles.push(outputFile)
        
        const reporter = new LLMReporter({
          outputFile,
          verbose: true,
          includePassedTests: true
        })
        
        reporter.onInit({} as any)
        await reporter.onFinished(tasks)
      })
      
      PerformanceAssertions.assertMeetsBaseline(result, 800, 'Complex errors processing')
      PerformanceAssertions.assertSuccessRate(result, 95)
      
      expect(result.averageTime).toBeLessThan(800)
    })
  })
  
  describe('Console Output Performance', () => {
    it('should handle heavy console output efficiently', async () => {
      const tasks = Array.from({ length: 10 }, () => 
        TestDataGenerator.generateConsoleHeavyTest(500) // 500 lines per test
      )
      
      const result = await runner.run('reporter_console_heavy', async () => {
        const outputFile = join(tmpdir(), `bench-console-${Date.now()}.json`)
        tempFiles.push(outputFile)
        
        const reporter = new LLMReporter({
          outputFile,
          verbose: true,
          includePassedTests: true,
          maxConsoleLines: 100 // Limit console output
        })
        
        reporter.onInit({} as any)
        await reporter.onFinished(tasks)
      })
      
      PerformanceAssertions.assertMeetsBaseline(result, 1000, 'Console heavy processing')
      PerformanceAssertions.assertSuccessRate(result, 95)
      PerformanceAssertions.assertMemoryWithinLimits(result, 150)
      
      expect(result.averageTime).toBeLessThan(1000)
    })
  })
  
  describe('File I/O Performance', () => {
    it('should write output files efficiently', async () => {
      const tasks = TestDataGenerator.generateTestSuite(100)
      
      const result = await runner.run('reporter_file_io', async () => {
        const outputFile = join(tmpdir(), `bench-io-${Date.now()}.json`)
        tempFiles.push(outputFile)
        
        const reporter = new LLMReporter({
          outputFile,
          verbose: true,
          includePassedTests: true
        })
        
        reporter.onInit({} as any)
        await reporter.onFinished(tasks)
        
        // Ensure file was written by checking existence
        const fs = await import('node:fs/promises')
        await fs.access(outputFile)
      })
      
      PerformanceAssertions.assertMeetsBaseline(result, 1200, 'File I/O operations')
      PerformanceAssertions.assertSuccessRate(result, 98)
      
      expect(result.averageTime).toBeLessThan(1200)
    })
  })
  
  describe('Memory Usage Benchmarks', () => {
    it('should manage memory efficiently during processing', async () => {
      const tasks = TestDataGenerator.generateTestSuite(200)
      
      const result = await runner.run('reporter_memory_usage', async () => {
        const outputFile = join(tmpdir(), `bench-memory-${Date.now()}.json`)
        tempFiles.push(outputFile)
        
        const reporter = new LLMReporter({
          outputFile,
          verbose: true,
          includePassedTests: true
        })
        
        reporter.onInit({} as any)
        await reporter.onFinished(tasks)
      })
      
      PerformanceAssertions.assertMemoryWithinLimits(result, 200)
      PerformanceAssertions.assertGCCount(result, 15)
      PerformanceAssertions.assertSuccessRate(result, 95)
      
      // Memory delta should be reasonable
      expect(result.memoryDelta).toBeLessThan(50 * 1024 * 1024) // 50MB max delta
    })
  })
  
  describe('Concurrent Operations', () => {
    it('should handle concurrent reporter instances', async () => {
      const tasks = TestDataGenerator.generateTestSuite(25)
      
      const result = await runner.run('reporter_concurrent', async () => {
        const promises = Array.from({ length: 4 }, async (_, i) => {
          const outputFile = join(tmpdir(), `bench-concurrent-${Date.now()}-${i}.json`)
          tempFiles.push(outputFile)
          
          const reporter = new LLMReporter({
            outputFile,
            verbose: false,
            includePassedTests: true
          })
          
          reporter.onInit({} as any)
          await reporter.onFinished(tasks)
        })
        
        await Promise.all(promises)
      })
      
      PerformanceAssertions.assertMeetsBaseline(result, 2000, 'Concurrent processing')
      PerformanceAssertions.assertSuccessRate(result, 95)
      PerformanceAssertions.assertMemoryWithinLimits(result, 300)
      
      expect(result.averageTime).toBeLessThan(2000)
    })
  })
  
  describe('Baseline Regression Tests', () => {
    it('should maintain consistent performance across runs', async () => {
      const tasks = TestDataGenerator.generateTestSuite(50)
      const results = []
      
      // Run the same benchmark multiple times
      for (let i = 0; i < 3; i++) {
        const result = await runner.run(`reporter_consistency_${i}`, async () => {
          const outputFile = join(tmpdir(), `bench-consistency-${Date.now()}-${i}.json`)
          tempFiles.push(outputFile)
          
          const reporter = new LLMReporter({
            outputFile,
            verbose: true,
            includePassedTests: true
          })
          
          reporter.onInit({} as any)
          await reporter.onFinished(tasks)
        })
        
        results.push(result)
      }
      
      // Check consistency across runs
      const avgTimes = results.map(r => r.averageTime)
      const maxVariation = Math.max(...avgTimes) - Math.min(...avgTimes)
      const avgTime = avgTimes.reduce((sum, time) => sum + time, 0) / avgTimes.length
      const variationPercent = (maxVariation / avgTime) * 100
      
      // Variation should be less than 30%
      expect(variationPercent).toBeLessThan(30)
      
      // All runs should meet baseline
      for (const result of results) {
        PerformanceAssertions.assertMeetsBaseline(result, 1200, 'Consistency test')
        PerformanceAssertions.assertSuccessRate(result, 95)
      }
    })
  })
})