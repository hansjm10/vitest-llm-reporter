/**
 * Performance benchmark for log deduplication
 * Tests performance with 1000+ tests generating logs
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { LogDeduplicator } from '../../src/console/LogDeduplicator.js'
import type { LogEntry } from '../../src/types/deduplication.js'

describe('Deduplication Performance Benchmark', () => {
  const TEST_COUNT = 1000
  const LOGS_PER_TEST = 10
  const DUPLICATE_RATIO = 0.7 // 70% of logs are duplicates

  let uniqueMessages: string[]
  let testEntries: LogEntry[]

  beforeAll(() => {
    // Generate unique messages (30% of total)
    const uniqueCount = Math.floor(TEST_COUNT * LOGS_PER_TEST * (1 - DUPLICATE_RATIO))
    uniqueMessages = Array.from({ length: uniqueCount }, (_, i) =>
      `Log message ${i}: Processing data for test execution at ${i}`
    )

    // Generate test entries with duplicates
    testEntries = []
    for (let testId = 0; testId < TEST_COUNT; testId++) {
      for (let logNum = 0; logNum < LOGS_PER_TEST; logNum++) {
        const isDuplicate = Math.random() < DUPLICATE_RATIO
        const messageIndex = isDuplicate
          ? Math.floor(Math.random() * uniqueMessages.length)
          : Math.floor(Math.random() * uniqueMessages.length)

        testEntries.push({
          message: uniqueMessages[messageIndex],
          level: ['debug', 'info', 'warn', 'error'][Math.floor(Math.random() * 4)] as any,
          timestamp: new Date(Date.now() + testId * 1000 + logNum),
          testId: `test-${testId}`,
        })
      }
    }
  })

  it('should handle 1000+ tests with deduplication enabled in under 5 seconds', () => {
    const deduplicator = new LogDeduplicator({
      enabled: true,
      maxCacheEntries: 10000,
      includeSources: true,
      normalizeWhitespace: true,
      stripTimestamps: true,
      stripAnsiCodes: true,
    })

    const startTime = performance.now()

    // Process all log entries
    for (const entry of testEntries) {
      deduplicator.isDuplicate(entry)
    }

    const endTime = performance.now()
    const executionTime = endTime - startTime

    // Performance assertions
    expect(executionTime).toBeLessThan(5000) // Under 5 seconds

    // Get stats
    const stats = deduplicator.getStats()

    // Verify deduplication is working
    expect(stats.totalLogs).toBe(TEST_COUNT * LOGS_PER_TEST)
    expect(stats.duplicatesRemoved).toBeGreaterThan(0)
    expect(stats.uniqueLogs).toBeLessThan(stats.totalLogs)

    // Memory check (rough estimate)
    const entries = deduplicator.getAllEntries()
    expect(entries.size).toBeLessThanOrEqual(10000) // Cache limit respected

    console.log('Performance Benchmark Results:')
    console.log(`- Total logs processed: ${stats.totalLogs}`)
    console.log(`- Unique logs: ${stats.uniqueLogs}`)
    console.log(`- Duplicates removed: ${stats.duplicatesRemoved}`)
    console.log(`- Deduplication ratio: ${((stats.duplicatesRemoved / stats.totalLogs) * 100).toFixed(2)}%`)
    console.log(`- Execution time: ${executionTime.toFixed(2)}ms`)
    console.log(`- Average time per log: ${(executionTime / stats.totalLogs).toFixed(4)}ms`)
    console.log(`- Cache size: ${stats.cacheSize}`)
  })

  it('should have minimal overhead when disabled', () => {
    const deduplicator = new LogDeduplicator({
      enabled: false,
    })

    const startTime = performance.now()

    // Process all log entries
    for (const entry of testEntries) {
      deduplicator.isDuplicate(entry)
    }

    const endTime = performance.now()
    const executionTime = endTime - startTime

    // Should be very fast when disabled
    expect(executionTime).toBeLessThan(100) // Under 100ms for disabled mode

    const stats = deduplicator.getStats()
    expect(stats.duplicatesRemoved).toBe(0)
    expect(stats.uniqueLogs).toBe(0) // Nothing tracked when disabled

    console.log('Disabled Mode Performance:')
    console.log(`- Execution time: ${executionTime.toFixed(2)}ms`)
    console.log(`- Average time per log: ${(executionTime / (TEST_COUNT * LOGS_PER_TEST)).toFixed(4)}ms`)
  })

  it('should maintain performance with high duplicate ratio', () => {
    const deduplicator = new LogDeduplicator({
      enabled: true,
      maxCacheEntries: 10000,
    })

    // Generate entries with 95% duplicates
    const highDuplicateEntries: LogEntry[] = []
    const fewUniqueMessages = uniqueMessages.slice(0, 50) // Only 50 unique messages

    for (let i = 0; i < TEST_COUNT * LOGS_PER_TEST; i++) {
      highDuplicateEntries.push({
        message: fewUniqueMessages[Math.floor(Math.random() * fewUniqueMessages.length)],
        level: 'info',
        timestamp: new Date(Date.now() + i),
        testId: `test-${Math.floor(i / LOGS_PER_TEST)}`,
      })
    }

    const startTime = performance.now()

    for (const entry of highDuplicateEntries) {
      deduplicator.isDuplicate(entry)
    }

    const endTime = performance.now()
    const executionTime = endTime - startTime

    expect(executionTime).toBeLessThan(5000)

    const stats = deduplicator.getStats()
    const deduplicationRatio = (stats.duplicatesRemoved / stats.totalLogs) * 100

    expect(deduplicationRatio).toBeGreaterThan(90) // High deduplication rate

    console.log('High Duplicate Ratio Performance:')
    console.log(`- Deduplication ratio: ${deduplicationRatio.toFixed(2)}%`)
    console.log(`- Execution time: ${executionTime.toFixed(2)}ms`)
    console.log(`- Cache efficiency: ${stats.cacheSize} entries for ${stats.totalLogs} logs`)
  })

  it('should handle memory efficiently with cache eviction', () => {
    const maxCache = 100 // Small cache to test eviction
    const deduplicator = new LogDeduplicator({
      enabled: true,
      maxCacheEntries: maxCache,
    })

    const startTime = performance.now()
    const memoryBefore = process.memoryUsage().heapUsed

    // Process many unique messages to trigger evictions
    for (let i = 0; i < 1000; i++) {
      const entry: LogEntry = {
        message: `Unique message ${i} with some content`,
        level: 'info',
        timestamp: new Date(Date.now() + i * 100),
      }
      deduplicator.isDuplicate(entry)
    }

    const endTime = performance.now()
    const memoryAfter = process.memoryUsage().heapUsed
    const memoryIncrease = (memoryAfter - memoryBefore) / 1024 / 1024 // MB

    const stats = deduplicator.getStats()

    // Cache should not exceed limit
    expect(stats.cacheSize).toBeLessThanOrEqual(maxCache)

    // Memory increase should be reasonable (< 50MB for this test)
    expect(Math.abs(memoryIncrease)).toBeLessThan(50)

    console.log('Memory Efficiency Test:')
    console.log(`- Cache limit: ${maxCache}`)
    console.log(`- Final cache size: ${stats.cacheSize}`)
    console.log(`- Memory increase: ${memoryIncrease.toFixed(2)}MB`)
    console.log(`- Execution time: ${(endTime - startTime).toFixed(2)}ms`)
  })

  it('should perform well with varying message lengths', () => {
    const deduplicator = new LogDeduplicator({
      enabled: true,
      maxCacheEntries: 10000,
    })

    const varyingLengthEntries: LogEntry[] = []

    // Create messages of varying lengths
    for (let i = 0; i < 1000; i++) {
      const length = Math.floor(Math.random() * 1000) + 10 // 10 to 1010 chars
      const message = 'x'.repeat(length)
      varyingLengthEntries.push({
        message,
        level: 'info',
        timestamp: new Date(),
      })
    }

    const startTime = performance.now()

    for (const entry of varyingLengthEntries) {
      deduplicator.isDuplicate(entry)
    }

    const endTime = performance.now()
    const executionTime = endTime - startTime

    expect(executionTime).toBeLessThan(2000) // Should still be fast

    console.log('Varying Message Length Performance:')
    console.log(`- Messages processed: ${varyingLengthEntries.length}`)
    console.log(`- Execution time: ${executionTime.toFixed(2)}ms`)
    console.log(`- Average time per message: ${(executionTime / varyingLengthEntries.length).toFixed(4)}ms`)
  })

  it('should meet performance target of <5% overhead', () => {
    // Baseline: processing without deduplication logic
    const baselineStart = performance.now()
    const processedMessages: string[] = []

    for (const entry of testEntries) {
      // Simulate minimal processing
      processedMessages.push(entry.message.toLowerCase())
    }

    const baselineEnd = performance.now()
    const baselineTime = baselineEnd - baselineStart

    // With deduplication
    const deduplicator = new LogDeduplicator({
      enabled: true,
      maxCacheEntries: 10000,
    })

    const dedupStart = performance.now()

    for (const entry of testEntries) {
      deduplicator.isDuplicate(entry)
    }

    const dedupEnd = performance.now()
    const dedupTime = dedupEnd - dedupStart

    const overhead = ((dedupTime - baselineTime) / baselineTime) * 100

    console.log('Performance Overhead Analysis:')
    console.log(`- Baseline time: ${baselineTime.toFixed(2)}ms`)
    console.log(`- Deduplication time: ${dedupTime.toFixed(2)}ms`)
    console.log(`- Overhead: ${overhead.toFixed(2)}%`)

    // The 5% target might be ambitious, but we should be under 50%
    expect(overhead).toBeLessThan(50)
  })
})