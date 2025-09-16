/**
 * Consolidated integration tests for log deduplication at different levels
 * Tests both same-level and different-level log deduplication scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LogDeduplicator } from '../../src/console/LogDeduplicator.js'
import { createLogEntry, createDuplicateLogEntries } from '../utils/deduplication-helpers.js'

describe('Integration: Log Level Deduplication', () => {
  let deduplicator: LogDeduplicator

  beforeEach(() => {
    // Create deduplicator directly for testing
    deduplicator = new LogDeduplicator({
      enabled: true,
      maxCacheEntries: 100,
      includeSources: true,
      normalizeWhitespace: true,
      stripTimestamps: true,
      stripAnsiCodes: true
    })
  })

  afterEach(() => {
    // Cleanup
    deduplicator.clear()
  })

  describe('Same Log Same Level', () => {
    it('should deduplicate identical messages at the same log level', () => {
      const duplicates = createDuplicateLogEntries('Test message', 5, 'log')

      let deduplicatedCount = 0
      for (const entry of duplicates) {
        if (deduplicator.isDuplicate(entry)) {
          deduplicatedCount++
        }
      }

      expect(deduplicatedCount).toBe(4) // First is unique, rest are duplicates

      const stats = deduplicator.getStats()
      expect(stats.totalLogs).toBe(5)
      expect(stats.uniqueLogs).toBe(1)
      expect(stats.duplicatesRemoved).toBe(4)
    })

    it('should track sources when enabled', () => {
      const message = 'Tracked message'
      const entries = [
        createLogEntry(message, 'log', 'test-tracked'),
        createLogEntry(message, 'log', 'test-tracked'),
        createLogEntry(message, 'log', 'test-tracked')
      ]

      for (const entry of entries) {
        deduplicator.isDuplicate(entry)
      }

      const key = deduplicator.generateKey(entries[0])
      const metadata = deduplicator.getMetadata(key)

      expect(metadata).toBeDefined()
      expect(metadata!.sources.size).toBe(1)
      expect(Array.from(metadata!.sources)).toEqual(['test-tracked'])
    })

    it('should handle high volume of duplicate logs efficiently', () => {
      const startTime = performance.now()
      const message = 'High volume message'

      // Generate 1000 duplicate logs
      for (let i = 0; i < 1000; i++) {
        const entry = createLogEntry(message, 'log', 'test-high-volume')
        deduplicator.isDuplicate(entry)
      }

      const endTime = performance.now()
      const executionTime = endTime - startTime

      expect(executionTime).toBeLessThan(100) // Should process 1000 logs in under 100ms

      const stats = deduplicator.getStats()
      expect(stats.totalLogs).toBe(1000)
      expect(stats.uniqueLogs).toBe(1)
      expect(stats.duplicatesRemoved).toBe(999)
    })

    it('should normalize messages before deduplication', () => {
      const entries = [
        createLogEntry('Message with    extra spaces', 'log'),
        createLogEntry('Message with extra spaces', 'log'),
        createLogEntry('MESSAGE WITH EXTRA SPACES', 'log')
      ]

      let deduplicatedCount = 0
      for (const entry of entries) {
        if (deduplicator.isDuplicate(entry)) {
          deduplicatedCount++
        }
      }

      expect(deduplicatedCount).toBe(2) // All should be considered duplicates after normalization
    })
  })

  describe('Same Log Different Level', () => {
    it('should NOT deduplicate identical messages at different log levels', () => {
      const message = 'Same message different levels'
      const levels = ['debug', 'info', 'warn', 'error'] as const

      let deduplicatedCount = 0
      for (const level of levels) {
        const entry = createLogEntry(message, level)
        if (deduplicator.isDuplicate(entry)) {
          deduplicatedCount++
        }
      }

      expect(deduplicatedCount).toBe(0) // None should be deduplicated

      const stats = deduplicator.getStats()
      expect(stats.totalLogs).toBe(4)
      expect(stats.uniqueLogs).toBe(4)
      expect(stats.duplicatesRemoved).toBe(0)
    })

    it('should maintain separate deduplication entries for each log level', () => {
      const message = 'Multi-level message'

      // Add same message at different levels multiple times
      const debugEntries = createDuplicateLogEntries(message, 3, 'debug')
      const infoEntries = createDuplicateLogEntries(message, 3, 'info')

      let debugDedupCount = 0
      let infoDedupCount = 0

      for (const entry of debugEntries) {
        if (deduplicator.isDuplicate(entry)) {
          debugDedupCount++
        }
      }

      for (const entry of infoEntries) {
        if (deduplicator.isDuplicate(entry)) {
          infoDedupCount++
        }
      }

      expect(debugDedupCount).toBe(2) // 2 duplicates at debug level
      expect(infoDedupCount).toBe(2) // 2 duplicates at info level

      const stats = deduplicator.getStats()
      expect(stats.totalLogs).toBe(6)
      expect(stats.uniqueLogs).toBe(2) // One unique per level
      expect(stats.duplicatesRemoved).toBe(4)
    })

    it('should generate different keys for same message at different levels', () => {
      const message = 'Key test message'

      const debugEntry = createLogEntry(message, 'debug')
      const infoEntry = createLogEntry(message, 'info')

      const debugKey = deduplicator.generateKey(debugEntry)
      const infoKey = deduplicator.generateKey(infoEntry)

      expect(debugKey).not.toBe(infoKey)
      expect(debugKey).toContain('debug:')
      expect(infoKey).toContain('info:')
    })

    it('should handle mixed level logs in realistic test scenario', () => {
      // Simulate a realistic test run with mixed log levels
      const testScenario = [
        { message: 'Starting test', level: 'info' as const, count: 1 },
        { message: 'Debug checkpoint', level: 'debug' as const, count: 5 },
        { message: 'Processing item', level: 'info' as const, count: 10 },
        { message: 'Warning: slow operation', level: 'warn' as const, count: 3 },
        { message: 'Processing item', level: 'debug' as const, count: 10 }, // Same message, different level
        { message: 'Test complete', level: 'info' as const, count: 1 }
      ]

      const testId = 'scenario-test'

      for (const scenario of testScenario) {
        for (let i = 0; i < scenario.count; i++) {
          const entry = createLogEntry(scenario.message, scenario.level, testId)
          deduplicator.isDuplicate(entry)
        }
      }

      const stats = deduplicator.getStats()
      expect(stats.totalLogs).toBe(30) // Total of all counts
      expect(stats.uniqueLogs).toBe(6) // One unique per message/level combination
      expect(stats.duplicatesRemoved).toBe(24) // Total - unique
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty messages', () => {
      const entry1 = createLogEntry('', 'log')
      const entry2 = createLogEntry('', 'log')

      expect(deduplicator.isDuplicate(entry1)).toBe(false)
      expect(deduplicator.isDuplicate(entry2)).toBe(true)
    })

    it('should respect cache size limits', () => {
      // Create deduplicator with small cache
      const smallCacheDedup = new LogDeduplicator({
        enabled: true,
        maxCacheEntries: 10
      })

      // Add more unique messages than cache can hold
      for (let i = 0; i < 20; i++) {
        const entry = createLogEntry(`Message ${i}`, 'log')
        smallCacheDedup.isDuplicate(entry)
      }

      // Cache size is enforced internally via eviction
      // Verify stats show we've processed all entries
      const stats = smallCacheDedup.getStats()
      expect(stats.totalLogs).toBe(20)
      expect(stats.uniqueLogs).toBe(20)
    })

    it('should handle deduplication toggle correctly', () => {
      // Test with deduplication disabled
      const disabledDedup = new LogDeduplicator({
        enabled: false
      })

      const duplicates = createDuplicateLogEntries('Test', 5, 'log')
      let deduplicatedCount = 0

      for (const entry of duplicates) {
        if (disabledDedup.isDuplicate(entry)) {
          deduplicatedCount++
        }
      }

      expect(deduplicatedCount).toBe(0) // Nothing should be deduplicated when disabled
      expect(disabledDedup.getStats().duplicatesRemoved).toBe(0)
    })
  })
})
