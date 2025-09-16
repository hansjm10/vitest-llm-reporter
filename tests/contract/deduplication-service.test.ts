/**
 * Contract test for deduplication service interface
 * Tests the ILogDeduplicator interface implementation
 *
 * These tests MUST FAIL initially (TDD Red phase)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { ILogDeduplicator, DeduplicationConfig } from '../../src/types/deduplication.js'
import { createLogEntry, createDuplicateLogEntries } from '../utils/deduplication-helpers.js'

// This import will fail initially - LogDeduplicator doesn't exist yet
// @ts-expect-error - Implementation doesn't exist yet (TDD)
import { LogDeduplicator } from '../../src/console/LogDeduplicator.js'

describe('ILogDeduplicator Service Contract', () => {
  let deduplicator: ILogDeduplicator
  let config: DeduplicationConfig

  beforeEach(() => {
    config = {
      enabled: true,
      maxCacheEntries: 1000,
      includeSources: true,
      normalizeWhitespace: true,
      stripTimestamps: true,
      stripAnsiCodes: true
    }
    // This will fail - LogDeduplicator doesn't exist yet
    // @ts-expect-error - Implementation doesn't exist yet (TDD)
    deduplicator = new LogDeduplicator(config)
  })

  describe('isDuplicate', () => {
    it('should return false for first occurrence of a log', () => {
      const entry = createLogEntry('First log message', 'info', 'test-1')
      const isDupe = deduplicator.isDuplicate(entry)
      expect(isDupe).toBe(false)
    })

    it('should return true for second occurrence of same log in the same test', () => {
      const entry1 = createLogEntry('Duplicate message', 'info', 'test-1')
      const entry2 = createLogEntry('Duplicate message', 'info', 'test-1')

      expect(deduplicator.isDuplicate(entry1)).toBe(false)
      expect(deduplicator.isDuplicate(entry2)).toBe(true)
    })

    it('should not deduplicate identical logs from different tests', () => {
      const entry1 = createLogEntry('Duplicate message', 'info', 'test-1')
      const entry2 = createLogEntry('Duplicate message', 'info', 'test-2')

      expect(deduplicator.isDuplicate(entry1)).toBe(false)
      expect(deduplicator.isDuplicate(entry2)).toBe(false)
    })

    it('should track multiple duplicates', () => {
      const entries = createDuplicateLogEntries('Same message', 5, 'warn')

      expect(deduplicator.isDuplicate(entries[0])).toBe(false)
      expect(deduplicator.isDuplicate(entries[1])).toBe(true)
      expect(deduplicator.isDuplicate(entries[2])).toBe(true)
      expect(deduplicator.isDuplicate(entries[3])).toBe(true)
      expect(deduplicator.isDuplicate(entries[4])).toBe(true)
    })

    it('should consider log level when detecting duplicates', () => {
      const debugLog = createLogEntry('Same text', 'debug', 'test-1')
      const errorLog = createLogEntry('Same text', 'error', 'test-2')

      expect(deduplicator.isDuplicate(debugLog)).toBe(false)
      expect(deduplicator.isDuplicate(errorLog)).toBe(false) // Different level
    })

    it('should normalize whitespace when configured', () => {
      const entry1 = createLogEntry('Message    with   spaces', 'info')
      const entry2 = createLogEntry('Message with spaces', 'info')

      expect(deduplicator.isDuplicate(entry1)).toBe(false)
      expect(deduplicator.isDuplicate(entry2)).toBe(true) // Normalized to same
    })

    it('should strip timestamps when configured', () => {
      const entry1 = createLogEntry('Log at 2024-01-01T10:00:00.000Z', 'info')
      const entry2 = createLogEntry('Log at 2024-01-01T11:00:00.000Z', 'info')

      expect(deduplicator.isDuplicate(entry1)).toBe(false)
      expect(deduplicator.isDuplicate(entry2)).toBe(true) // Timestamps stripped
    })

    it('should strip ANSI codes when configured', () => {
      const entry1 = createLogEntry('\x1b[31mRed text\x1b[0m', 'info')
      const entry2 = createLogEntry('Red text', 'info')

      expect(deduplicator.isDuplicate(entry1)).toBe(false)
      expect(deduplicator.isDuplicate(entry2)).toBe(true) // ANSI stripped
    })

    it('should respect maxCacheEntries limit', () => {
      const smallConfig: DeduplicationConfig = {
        ...config,
        maxCacheEntries: 3
      }
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const limitedDeduplicator = new LogDeduplicator(smallConfig)

      // Add 4 unique messages
      expect(limitedDeduplicator.isDuplicate(createLogEntry('Message 1', 'info'))).toBe(false)
      expect(limitedDeduplicator.isDuplicate(createLogEntry('Message 2', 'info'))).toBe(false)
      expect(limitedDeduplicator.isDuplicate(createLogEntry('Message 3', 'info'))).toBe(false)
      expect(limitedDeduplicator.isDuplicate(createLogEntry('Message 4', 'info'))).toBe(false)

      // Cache should have evicted oldest entry
      const stats = limitedDeduplicator.getStats()
      expect(stats.cacheSize).toBeLessThanOrEqual(3)
    })
  })

  describe('generateKey', () => {
    it('should generate consistent keys for same input', () => {
      const entry = createLogEntry('Test message', 'info')
      const key1 = deduplicator.generateKey(entry)
      const key2 = deduplicator.generateKey(entry)
      expect(key1).toBe(key2)
    })

    it('should generate different keys for different levels', () => {
      const infoEntry = createLogEntry('Same message', 'info')
      const warnEntry = createLogEntry('Same message', 'warn')

      const infoKey = deduplicator.generateKey(infoEntry)
      const warnKey = deduplicator.generateKey(warnEntry)

      expect(infoKey).not.toBe(warnKey)
    })

    it('should generate same key for normalized messages', () => {
      const entry1 = createLogEntry('Message   with  spaces', 'info')
      const entry2 = createLogEntry('Message with spaces', 'info')

      const key1 = deduplicator.generateKey(entry1)
      const key2 = deduplicator.generateKey(entry2)

      expect(key1).toBe(key2)
    })

    it('should include log level in key format', () => {
      const entry = createLogEntry('Test', 'error')
      const key = deduplicator.generateKey(entry)
      expect(key).toContain('error:')
    })
  })

  describe('getMetadata', () => {
    it('should return undefined for non-existent key', () => {
      const metadata = deduplicator.getMetadata('non-existent-key')
      expect(metadata).toBeUndefined()
    })

    it('should return metadata for existing entry', () => {
      const entry = createLogEntry('Test message', 'info', 'test-1')
      deduplicator.isDuplicate(entry)

      const key = deduplicator.generateKey(entry)
      const metadata = deduplicator.getMetadata(key)

      expect(metadata).toBeDefined()
      expect(metadata?.originalMessage).toBe('Test message')
      expect(metadata?.logLevel).toBe('info')
      expect(metadata?.count).toBe(1)
      expect(metadata?.sources.has('test-1')).toBe(true)
    })

    it('should update metadata on duplicate', () => {
      const entry1 = createLogEntry('Duplicate', 'warn', 'test-1')
      const entry2 = createLogEntry('Duplicate', 'warn', 'test-1')

      deduplicator.isDuplicate(entry1)
      deduplicator.isDuplicate(entry2)

      const key = deduplicator.generateKey(entry1)
      const metadata = deduplicator.getMetadata(key)

      expect(metadata?.count).toBe(2)
      expect(metadata?.sources.size).toBe(1)
      expect(metadata?.sources.has('test-1')).toBe(true)
    })
  })

  // getAllEntries removed - it was never used in production code
  // The method was only used in tests and not in actual implementation

  describe('getStats', () => {
    it('should track total logs processed', () => {
      const entries = [
        createLogEntry('Message 1', 'info', 'test-a'),
        createLogEntry('Message 1', 'info', 'test-a'), // duplicate in same test
        createLogEntry('Message 2', 'warn', 'test-a')
      ]

      entries.forEach((entry) => deduplicator.isDuplicate(entry))

      const stats = deduplicator.getStats()
      expect(stats.totalLogs).toBe(3)
    })

    it('should track unique logs', () => {
      const entries = [
        createLogEntry('Message 1', 'info', 'test-a'),
        createLogEntry('Message 1', 'info', 'test-a'), // duplicate
        createLogEntry('Message 2', 'warn', 'test-a'),
        createLogEntry('Message 2', 'warn', 'test-a') // duplicate
      ]

      entries.forEach((entry) => deduplicator.isDuplicate(entry))

      const stats = deduplicator.getStats()
      expect(stats.uniqueLogs).toBe(2)
    })

    it('should track duplicates removed', () => {
      const entries = createDuplicateLogEntries('Same', 5, 'info')
      entries.forEach((entry) => deduplicator.isDuplicate(entry))

      const stats = deduplicator.getStats()
      expect(stats.duplicatesRemoved).toBe(4) // 5 total, 1 unique, 4 duplicates
    })

    it('should track cache size', () => {
      deduplicator.isDuplicate(createLogEntry('Message 1', 'info'))
      deduplicator.isDuplicate(createLogEntry('Message 2', 'warn'))

      const stats = deduplicator.getStats()
      expect(stats.cacheSize).toBe(2)
    })

    it('should include processing time', () => {
      deduplicator.isDuplicate(createLogEntry('Test', 'info'))

      const stats = deduplicator.getStats()
      expect(stats.processingTimeMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('clear', () => {
    it('should reset all entries', () => {
      deduplicator.isDuplicate(createLogEntry('Message 1', 'info'))
      deduplicator.isDuplicate(createLogEntry('Message 2', 'warn'))

      deduplicator.clear()

      // Verify clear worked by checking stats are reset
      const stats = deduplicator.getStats()
      expect(stats.totalLogs).toBe(0)
      expect(stats.uniqueLogs).toBe(0)
    })

    it('should reset statistics', () => {
      const entries = createDuplicateLogEntries('Test', 3, 'info')
      entries.forEach((entry) => deduplicator.isDuplicate(entry))

      deduplicator.clear()

      const stats = deduplicator.getStats()
      expect(stats.totalLogs).toBe(0)
      expect(stats.uniqueLogs).toBe(0)
      expect(stats.duplicatesRemoved).toBe(0)
      expect(stats.cacheSize).toBe(0)
    })

    it('should allow detection of previously seen messages after clear', () => {
      const entry = createLogEntry('Message', 'info')

      deduplicator.isDuplicate(entry)
      expect(deduplicator.isDuplicate(entry)).toBe(true) // duplicate

      deduplicator.clear()

      expect(deduplicator.isDuplicate(entry)).toBe(false) // not duplicate after clear
    })
  })

  describe('isEnabled', () => {
    it('should return true when enabled in config', () => {
      expect(deduplicator.isEnabled()).toBe(true)
    })

    it('should return false when disabled in config', () => {
      const disabledConfig: DeduplicationConfig = {
        ...config,
        enabled: false
      }
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const disabledDeduplicator = new LogDeduplicator(disabledConfig)

      expect(disabledDeduplicator.isEnabled()).toBe(false)
    })

    it('should not track duplicates when disabled', () => {
      const disabledConfig: DeduplicationConfig = {
        ...config,
        enabled: false
      }
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const disabledDeduplicator = new LogDeduplicator(disabledConfig)

      const entry1 = createLogEntry('Message', 'info')
      const entry2 = createLogEntry('Message', 'info')

      // Should always return false when disabled
      expect(disabledDeduplicator.isDuplicate(entry1)).toBe(false)
      expect(disabledDeduplicator.isDuplicate(entry2)).toBe(false)
    })
  })
})
