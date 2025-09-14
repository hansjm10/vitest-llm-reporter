/**
 * Integration test for large scale (1000+ tests) performance
 * Tests that deduplication performs efficiently at scale
 * 
 * These tests MUST FAIL initially (TDD Red phase)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createLargeLogDataset } from '../utils/deduplication-helpers.js'
import type { DeduplicationConfig } from '../../src/types/deduplication.js'

// These imports will fail initially - implementations don't exist yet
// @ts-expect-error - Implementation doesn't exist yet (TDD)
import { LogDeduplicator } from '../../src/console/LogDeduplicator.js'
// @ts-expect-error - Implementation doesn't exist yet (TDD)
import { ConsoleCapture } from '../../src/console/ConsoleCapture.js'
// @ts-expect-error - Implementation doesn't exist yet (TDD)
import { performanceMonitor } from '../../src/monitoring/performance.js'

describe('Integration: Large Scale Performance (1000+ tests)', () => {
  let deduplicator: any // ILogDeduplicator
  let consoleCapture: any // ConsoleCapture
  let config: DeduplicationConfig

  beforeEach(() => {
    config = {
      enabled: true,
      maxCacheEntries: 10000,
      includeSources: true,
      normalizeWhitespace: true,
      stripTimestamps: true,
      stripAnsiCodes: true,
    }

    // @ts-expect-error - Implementation doesn't exist yet (TDD)
    deduplicator = new LogDeduplicator(config)
    
    // @ts-expect-error - Implementation doesn't exist yet (TDD)
    consoleCapture = new ConsoleCapture({
      deduplicator,
      enabled: true,
    })
  })

  afterEach(() => {
    if (consoleCapture?.restore) {
      consoleCapture.restore()
    }
    if (deduplicator?.clear) {
      deduplicator.clear()
    }
  })

  describe('Performance requirements', () => {
    it('should handle 1000 tests with 10K logs in under 5 seconds', () => {
      const startTime = Date.now()
      
      // Simulate 1000 tests with ~10 logs each
      for (let testNum = 0; testNum < 1000; testNum++) {
        const testId = `test-${testNum}`
        
        consoleCapture.startCapture(testId)
        
        // Each test logs 10 messages, some duplicates
        console.log(`Starting test ${testNum}`)
        console.log('Common setup message') // Will be duplicated across tests
        console.debug('Debug info')
        console.log('Common setup message') // Duplicate within test
        console.info(`Processing item ${testNum % 100}`) // Some duplicates across tests
        console.warn('Warning: slow operation') // Common warning
        console.log('Test execution')
        console.error('Minor error') // Common error
        console.log('Cleanup')
        console.log('Test complete')
        
        const output = consoleCapture.stopCapture(testId)
        
        // Verify deduplication is working
        const commonMsg = output.entries.find(e => 
          e.message === 'Common setup message'
        )
        if (commonMsg) {
          expect(commonMsg.deduplication?.count).toBeGreaterThanOrEqual(1)
        }
      }
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      // Should complete in under 5 seconds
      expect(duration).toBeLessThan(5000)
      
      // Verify deduplication statistics
      const stats = deduplicator.getStats()
      expect(stats.totalLogs).toBeGreaterThanOrEqual(10000)
      expect(stats.duplicatesRemoved).toBeGreaterThan(0)
      expect(stats.processingTimeMs).toBeLessThan(5000)
    })

    it('should maintain <5% performance overhead vs no deduplication', () => {
      const iterations = 100
      const logsPerIteration = 50
      
      // Measure baseline without deduplication
      const baselineStart = Date.now()
      const disabledConfig = { ...config, enabled: false }
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const disabledDedup = new LogDeduplicator(disabledConfig)
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const baselineCapture = new ConsoleCapture({
        deduplicator: disabledDedup,
        enabled: true,
      })
      
      for (let i = 0; i < iterations; i++) {
        baselineCapture.startCapture(`baseline-${i}`)
        for (let j = 0; j < logsPerIteration; j++) {
          console.log(`Log message ${j % 10}`) // 10 unique messages repeated
        }
        baselineCapture.stopCapture(`baseline-${i}`)
      }
      
      const baselineDuration = Date.now() - baselineStart
      baselineCapture.restore()
      
      // Measure with deduplication enabled
      const dedupStart = Date.now()
      
      for (let i = 0; i < iterations; i++) {
        consoleCapture.startCapture(`dedup-${i}`)
        for (let j = 0; j < logsPerIteration; j++) {
          console.log(`Log message ${j % 10}`) // Same pattern
        }
        consoleCapture.stopCapture(`dedup-${i}`)
      }
      
      const dedupDuration = Date.now() - dedupStart
      
      // Calculate overhead
      const overhead = ((dedupDuration - baselineDuration) / baselineDuration) * 100
      
      // Should have less than 5% overhead
      expect(overhead).toBeLessThan(5)
    })

    it('should use less than 500MB memory for 1000 tests', () => {
      // Get initial memory usage
      const initialMemory = process.memoryUsage().heapUsed
      
      // Simulate 1000 tests with various log patterns
      for (let testNum = 0; testNum < 1000; testNum++) {
        const testId = `memory-test-${testNum}`
        
        consoleCapture.startCapture(testId)
        
        // Generate various log patterns
        for (let i = 0; i < 20; i++) {
          if (i % 5 === 0) {
            console.log('Common message') // High duplication
          } else if (i % 3 === 0) {
            console.warn(`Warning ${testNum % 50}`) // Medium duplication
          } else {
            console.info(`Unique message ${testNum}-${i}`) // Low duplication
          }
        }
        
        consoleCapture.stopCapture(testId)
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }
      
      // Check memory usage
      const finalMemory = process.memoryUsage().heapUsed
      const memoryUsed = (finalMemory - initialMemory) / (1024 * 1024) // Convert to MB
      
      // Should use less than 500MB
      expect(memoryUsed).toBeLessThan(500)
      
      // Verify cache is managing size properly
      const stats = deduplicator.getStats()
      expect(stats.cacheSize).toBeLessThanOrEqual(config.maxCacheEntries!)
    })
  })

  describe('Cache management at scale', () => {
    it('should handle cache eviction when reaching maxCacheEntries', () => {
      const smallCacheConfig: DeduplicationConfig = {
        ...config,
        maxCacheEntries: 100, // Small cache for testing eviction
      }
      
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const limitedDedup = new LogDeduplicator(smallCacheConfig)
      
      // Generate more unique messages than cache can hold
      for (let i = 0; i < 200; i++) {
        const entry = {
          message: `Unique message ${i}`,
          level: 'info' as const,
          timestamp: new Date(),
          testId: `test-${i}`,
        }
        limitedDedup.isDuplicate(entry)
      }
      
      const stats = limitedDedup.getStats()
      
      // Cache should not exceed limit
      expect(stats.cacheSize).toBeLessThanOrEqual(100)
      
      // Should have processed all logs
      expect(stats.totalLogs).toBe(200)
      
      // Older entries should have been evicted (LRU)
      const oldEntry = {
        message: 'Unique message 0', // First message
        level: 'info' as const,
        timestamp: new Date(),
        testId: 'test-old',
      }
      
      const newEntry = {
        message: 'Unique message 199', // Last message
        level: 'info' as const,
        timestamp: new Date(),
        testId: 'test-new',
      }
      
      // Old entry should not be found (evicted)
      const oldKey = limitedDedup.generateKey(oldEntry)
      expect(limitedDedup.getMetadata(oldKey)).toBeUndefined()
      
      // Recent entry should still be in cache
      const newKey = limitedDedup.generateKey(newEntry)
      expect(limitedDedup.getMetadata(newKey)).toBeDefined()
    })

    it('should handle high duplication rate efficiently', () => {
      const startTime = Date.now()
      
      // Generate dataset with high duplication (90% duplicates)
      const dataset = createLargeLogDataset(
        100,  // 100 unique messages
        100,  // 100 copies of each
      )
      
      // Process all logs
      dataset.forEach(entry => {
        deduplicator.isDuplicate(entry)
      })
      
      const duration = Date.now() - startTime
      const stats = deduplicator.getStats()
      
      // Should process 10,000 logs quickly
      expect(duration).toBeLessThan(1000) // Under 1 second
      
      // Verify deduplication effectiveness
      expect(stats.totalLogs).toBe(10000)
      expect(stats.uniqueLogs).toBe(100)
      expect(stats.duplicatesRemoved).toBe(9900)
      
      // Cache should only contain unique entries
      expect(stats.cacheSize).toBe(100)
    })

    it('should handle low duplication rate efficiently', () => {
      const startTime = Date.now()
      
      // Generate dataset with low duplication (10% duplicates)
      const dataset = createLargeLogDataset(
        1000, // 1000 unique messages
        1.1,  // ~1.1 copies of each (some duplicates)
      )
      
      // Process all logs
      dataset.forEach(entry => {
        deduplicator.isDuplicate(entry)
      })
      
      const duration = Date.now() - startTime
      const stats = deduplicator.getStats()
      
      // Should still be fast even with many unique entries
      expect(duration).toBeLessThan(1000)
      
      // Verify statistics
      expect(stats.uniqueLogs).toBeGreaterThan(900)
      expect(stats.duplicatesRemoved).toBeLessThan(200)
    })
  })

  describe('Real-world test patterns', () => {
    it('should handle parallel test execution patterns', () => {
      const parallelTests = 10
      const promises: Promise<any>[] = []
      
      // Simulate parallel test execution
      for (let i = 0; i < parallelTests; i++) {
        const promise = new Promise((resolve) => {
          setTimeout(() => {
            const testId = `parallel-${i}`
            consoleCapture.startCapture(testId)
            
            // Common logs across parallel tests
            console.log('Test setup')
            console.log('Database connection established')
            console.log(`Running test ${i}`)
            console.log('Database connection established') // Duplicate
            console.log('Test cleanup')
            
            const output = consoleCapture.stopCapture(testId)
            resolve(output)
          }, Math.random() * 100) // Random delay to simulate real parallel execution
        })
        
        promises.push(promise)
      }
      
      return Promise.all(promises).then(outputs => {
        // Verify deduplication worked across parallel tests
        const stats = deduplicator.getStats()
        
        // "Database connection established" should be heavily deduplicated
        const dbLogs = stats.totalLogs // Total includes all logs
        expect(stats.duplicatesRemoved).toBeGreaterThan(0)
        
        // Each test should have gotten deduplicated output
        outputs.forEach(output => {
          const dbMsg = output.entries.find((e: any) => 
            e.message === 'Database connection established'
          )
          if (dbMsg && dbMsg.deduplication) {
            expect(dbMsg.deduplication.count).toBeGreaterThanOrEqual(1)
          }
        })
      })
    })

    it('should handle test suites with setup/teardown hooks', () => {
      // Simulate a test suite with beforeEach/afterEach
      const suiteTests = 100
      
      for (let suite = 0; suite < 10; suite++) {
        // beforeAll for suite
        console.log(`Suite ${suite} setup`)
        
        for (let test = 0; test < suiteTests / 10; test++) {
          const testId = `suite-${suite}-test-${test}`
          
          // beforeEach
          console.log('Test setup') // Will be duplicated many times
          console.log('Mocking services') // Will be duplicated many times
          
          consoleCapture.startCapture(testId)
          
          // Test body
          console.log(`Executing test ${test}`)
          if (test % 2 === 0) {
            console.warn('Slow test warning') // 50% of tests
          }
          
          consoleCapture.stopCapture(testId)
          
          // afterEach
          console.log('Test cleanup') // Will be duplicated many times
          console.log('Restoring mocks') // Will be duplicated many times
        }
        
        // afterAll for suite
        console.log(`Suite ${suite} teardown`)
      }
      
      const stats = deduplicator.getStats()
      
      // Setup/teardown logs should be heavily deduplicated
      expect(stats.duplicatesRemoved).toBeGreaterThan(200) // Many duplicates from hooks
      
      // Cache should still be within limits
      expect(stats.cacheSize).toBeLessThanOrEqual(config.maxCacheEntries!)
    })

    it('should maintain performance with mixed log levels', () => {
      const startTime = Date.now()
      
      // Simulate realistic log distribution
      for (let i = 0; i < 1000; i++) {
        const testId = `mixed-${i}`
        consoleCapture.startCapture(testId)
        
        // Typical test log pattern
        console.debug(`Debug: Test ${i} starting`)
        console.log('Standard log message')
        console.info('Test info')
        console.log('Standard log message') // Duplicate at same level
        
        if (i % 10 === 0) {
          console.warn('Performance warning')
        }
        
        if (i % 50 === 0) {
          console.error('Test error occurred')
        }
        
        console.debug('Debug: Test complete')
        
        consoleCapture.stopCapture(testId)
      }
      
      const duration = Date.now() - startTime
      const stats = deduplicator.getStats()
      
      // Should complete quickly
      expect(duration).toBeLessThan(3000)
      
      // Should have deduplicated appropriately
      expect(stats.duplicatesRemoved).toBeGreaterThan(1000) // "Standard log message" duplicates
      
      // Different levels should be tracked separately
      const entries = deduplicator.getAllEntries()
      const standardLogKeys = Array.from(entries.keys()).filter(key => 
        key.includes('log:') && entries.get(key)?.originalMessage === 'Standard log message'
      )
      expect(standardLogKeys.length).toBe(1) // Only one entry for 'log' level
    })
  })

  describe('Memory and performance monitoring', () => {
    it('should track performance metrics accurately', () => {
      const iterations = 500
      
      for (let i = 0; i < iterations; i++) {
        const entry = {
          message: i % 50 === 0 ? 'Common' : `Unique ${i}`,
          level: 'info' as const,
          timestamp: new Date(),
          testId: `perf-${i}`,
        }
        deduplicator.isDuplicate(entry)
      }
      
      const stats = deduplicator.getStats()
      
      // Verify metrics
      expect(stats.totalLogs).toBe(iterations)
      expect(stats.processingTimeMs).toBeGreaterThanOrEqual(0)
      expect(stats.processingTimeMs).toBeLessThan(1000) // Should be fast
      
      // Average time per log should be very small
      const avgTimePerLog = stats.processingTimeMs / stats.totalLogs
      expect(avgTimePerLog).toBeLessThan(1) // Less than 1ms per log
    })

    it('should provide performance warnings when approaching limits', () => {
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const monitor = performanceMonitor.getDeduplicationMetrics()
      
      // Simulate approaching memory limit
      const largeDataset = createLargeLogDataset(5000, 2)
      largeDataset.forEach(entry => deduplicator.isDuplicate(entry))
      
      // Check if warnings are generated
      const warnings = monitor.getWarnings()
      
      if (deduplicator.getStats().cacheSize > 9000) {
        // Should warn when cache is nearly full
        expect(warnings).toContain('Cache approaching maximum size')
      }
      
      // Memory usage warnings
      const memoryUsage = process.memoryUsage().heapUsed / (1024 * 1024)
      if (memoryUsage > 400) {
        expect(warnings).toContain('High memory usage detected')
      }
    })
  })
})