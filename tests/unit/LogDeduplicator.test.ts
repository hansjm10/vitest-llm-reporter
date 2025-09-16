/**
 * Unit tests for LogDeduplicator
 * Tests message normalization, key generation, and cache eviction
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { LogDeduplicator } from '../../src/console/LogDeduplicator.js'
import type { LogEntry } from '../../src/types/deduplication.js'

describe('LogDeduplicator', () => {
  describe('Message Normalization', () => {
    let deduplicator: LogDeduplicator

    beforeEach(() => {
      deduplicator = new LogDeduplicator({
        enabled: true,
        normalizeWhitespace: true,
        stripTimestamps: true,
        stripAnsiCodes: true
      })
    })

    it('should normalize whitespace in messages', () => {
      const entry1: LogEntry = {
        message: 'Multiple   spaces    between     words',
        level: 'info',
        timestamp: new Date()
      }
      const entry2: LogEntry = {
        message: 'Multiple spaces between words',
        level: 'info',
        timestamp: new Date()
      }

      // First entry is unique
      expect(deduplicator.isDuplicate(entry1)).toBe(false)
      // Second entry with different spacing should be duplicate
      expect(deduplicator.isDuplicate(entry2)).toBe(true)
    })

    it('should strip ANSI color codes', () => {
      const entry1: LogEntry = {
        message: '\x1b[31mRed text\x1b[0m with \x1b[32mgreen\x1b[0m',
        level: 'info',
        timestamp: new Date()
      }
      const entry2: LogEntry = {
        message: 'Red text with green',
        level: 'info',
        timestamp: new Date()
      }

      expect(deduplicator.isDuplicate(entry1)).toBe(false)
      expect(deduplicator.isDuplicate(entry2)).toBe(true)
    })

    it('should strip ISO timestamps', () => {
      const entry1: LogEntry = {
        message: 'Event at 2024-01-15T10:30:45.123Z occurred',
        level: 'info',
        timestamp: new Date()
      }
      const entry2: LogEntry = {
        message: 'Event at 2024-01-15T14:25:30.456Z occurred',
        level: 'info',
        timestamp: new Date()
      }

      expect(deduplicator.isDuplicate(entry1)).toBe(false)
      expect(deduplicator.isDuplicate(entry2)).toBe(true)
    })

    it('should strip common date formats', () => {
      const entry1: LogEntry = {
        message: 'Process started at 2024-01-15 10:30:45',
        level: 'info',
        timestamp: new Date()
      }
      const entry2: LogEntry = {
        message: 'Process started at 2024-01-16 14:25:30',
        level: 'info',
        timestamp: new Date()
      }

      expect(deduplicator.isDuplicate(entry1)).toBe(false)
      expect(deduplicator.isDuplicate(entry2)).toBe(true)
    })

    it('should strip Unix timestamps', () => {
      const entry1: LogEntry = {
        message: 'Timestamp: 1705321845 in the log',
        level: 'info',
        timestamp: new Date()
      }
      const entry2: LogEntry = {
        message: 'Timestamp: 1705408245 in the log',
        level: 'info',
        timestamp: new Date()
      }

      expect(deduplicator.isDuplicate(entry1)).toBe(false)
      expect(deduplicator.isDuplicate(entry2)).toBe(true)
    })

    it('should handle messages with multiple normalization needs', () => {
      const entry1: LogEntry = {
        message: '\x1b[33mWarning:\x1b[0m  Process   at 2024-01-15T10:30:45Z   completed',
        level: 'warn',
        timestamp: new Date()
      }
      const entry2: LogEntry = {
        message: 'Warning: Process at 2024-01-16T14:25:30Z completed',
        level: 'warn',
        timestamp: new Date()
      }

      expect(deduplicator.isDuplicate(entry1)).toBe(false)
      expect(deduplicator.isDuplicate(entry2)).toBe(true)
    })

    it('should respect configuration flags', () => {
      const dedupNoNormalize = new LogDeduplicator({
        enabled: true,
        normalizeWhitespace: false,
        stripTimestamps: false,
        stripAnsiCodes: false
      })

      const entry1: LogEntry = {
        message: 'Multiple   spaces',
        level: 'info',
        timestamp: new Date()
      }
      const entry2: LogEntry = {
        message: 'Multiple spaces',
        level: 'info',
        timestamp: new Date()
      }

      expect(dedupNoNormalize.isDuplicate(entry1)).toBe(false)
      expect(dedupNoNormalize.isDuplicate(entry2)).toBe(false) // Different without normalization
    })

    it('should not strip standalone numeric identifiers', () => {
      const entry1: LogEntry = {
        message: 'User 1234567890 failed login',
        level: 'info',
        timestamp: new Date()
      }
      const entry2: LogEntry = {
        message: 'User 0987654321 failed login',
        level: 'info',
        timestamp: new Date()
      }

      expect(deduplicator.isDuplicate(entry1)).toBe(false)
      expect(deduplicator.isDuplicate(entry2)).toBe(false)
    })

    it('should strip labeled unix timestamps', () => {
      const entry1: LogEntry = {
        message: 'timestamp: 1700000000 starting job',
        level: 'info',
        timestamp: new Date()
      }
      const entry2: LogEntry = {
        message: 'timestamp: 1700000100 starting job',
        level: 'info',
        timestamp: new Date()
      }

      expect(deduplicator.isDuplicate(entry1)).toBe(false)
      expect(deduplicator.isDuplicate(entry2)).toBe(true)
    })

    it('should deduplicate identical messages across tests by default', () => {
      const entry1: LogEntry = {
        message: 'Shared message',
        level: 'info',
        timestamp: new Date(),
        testId: 'test-a'
      }
      const entry2: LogEntry = {
        message: 'Shared message',
        level: 'info',
        timestamp: new Date(),
        testId: 'test-b'
      }

      expect(deduplicator.isDuplicate(entry1)).toBe(false)
      expect(deduplicator.isDuplicate(entry2)).toBe(true)
    })
  })

  describe('Key Generation', () => {
    let deduplicator: LogDeduplicator

    beforeEach(() => {
      deduplicator = new LogDeduplicator({
        enabled: true
      })
    })

    it('should generate consistent keys for identical messages', () => {
      const entry: LogEntry = {
        message: 'Test message',
        level: 'info',
        timestamp: new Date()
      }

      const key1 = deduplicator.generateKey(entry)
      const key2 = deduplicator.generateKey(entry)

      expect(key1).toBe(key2)
    })

    it('should include log level in the key', () => {
      const infoEntry: LogEntry = {
        message: 'Same message',
        level: 'info',
        timestamp: new Date()
      }
      const warnEntry: LogEntry = {
        message: 'Same message',
        level: 'warn',
        timestamp: new Date()
      }

      const infoKey = deduplicator.generateKey(infoEntry)
      const warnKey = deduplicator.generateKey(warnEntry)

      expect(infoKey).not.toBe(warnKey)
      expect(infoKey).toMatch(/^info:/)
      expect(warnKey).toMatch(/^warn:/)
    })

    it('should generate short hash keys', () => {
      const entry: LogEntry = {
        message: 'A very long message that would create a very long hash if not truncated',
        level: 'debug',
        timestamp: new Date()
      }

      const key = deduplicator.generateKey(entry)
      const [level, hash] = key.split(':')

      expect(level).toBe('debug')
      expect(hash.length).toBeGreaterThan(0) // Base36 hash
    })

    it('should generate different keys for different messages', () => {
      const entry1: LogEntry = {
        message: 'First message',
        level: 'info',
        timestamp: new Date()
      }
      const entry2: LogEntry = {
        message: 'Second message',
        level: 'info',
        timestamp: new Date()
      }

      const key1 = deduplicator.generateKey(entry1)
      const key2 = deduplicator.generateKey(entry2)

      expect(key1).not.toBe(key2)
    })

    it('should ignore test identifier when using global scope', () => {
      const baseMessage = 'Scoped message'
      const entry1: LogEntry = {
        message: baseMessage,
        level: 'info',
        timestamp: new Date(),
        testId: 'test-a'
      }
      const entry2: LogEntry = {
        message: baseMessage,
        level: 'info',
        timestamp: new Date(),
        testId: 'test-b'
      }

      const key1 = deduplicator.generateKey(entry1)
      const key2 = deduplicator.generateKey(entry2)

      expect(key1).toBe(key2)
    })

    it('should scope keys by test identifier when per-test scope configured', () => {
      const perTest = new LogDeduplicator({
        enabled: true,
        scope: 'per-test'
      })

      const baseMessage = 'Scoped message'
      const entry1: LogEntry = {
        message: baseMessage,
        level: 'info',
        timestamp: new Date(),
        testId: 'test-a'
      }
      const entry2: LogEntry = {
        message: baseMessage,
        level: 'info',
        timestamp: new Date(),
        testId: 'test-b'
      }

      const key1 = perTest.generateKey(entry1)
      const key2 = perTest.generateKey(entry2)

      expect(key1).not.toBe(key2)
    })

    it('should handle empty messages', () => {
      const entry: LogEntry = {
        message: '',
        level: 'info',
        timestamp: new Date()
      }

      const key = deduplicator.generateKey(entry)
      expect(key).toMatch(/^info:[a-z0-9]+$/)
    })

    it('should handle special characters in messages', () => {
      const entry: LogEntry = {
        message: '!@#$%^&*()_+-=[]{}|;\':",./<>?',
        level: 'error',
        timestamp: new Date()
      }

      const key = deduplicator.generateKey(entry)
      expect(key).toMatch(/^error:[a-z0-9-]+$/)
    })
  })

  describe('Cache Eviction', () => {
    it('should evict oldest entry when cache is full', () => {
      const deduplicator = new LogDeduplicator({
        enabled: true,
        maxCacheEntries: 3
      })

      // Add entries with different timestamps
      const baseTime = new Date('2024-01-01T00:00:00Z')

      const entry1: LogEntry = {
        message: 'First message',
        level: 'info',
        timestamp: new Date(baseTime.getTime())
      }
      const entry2: LogEntry = {
        message: 'Second message',
        level: 'info',
        timestamp: new Date(baseTime.getTime() + 1000)
      }
      const entry3: LogEntry = {
        message: 'Third message',
        level: 'info',
        timestamp: new Date(baseTime.getTime() + 2000)
      }

      // Fill the cache
      expect(deduplicator.isDuplicate(entry1)).toBe(false)
      expect(deduplicator.isDuplicate(entry2)).toBe(false)
      expect(deduplicator.isDuplicate(entry3)).toBe(false)

      // Update entry2 to make it more recent
      expect(deduplicator.isDuplicate(entry2)).toBe(true)

      // Add a fourth entry, should evict entry1 (oldest lastSeen)
      const entry4: LogEntry = {
        message: 'Fourth message',
        level: 'info',
        timestamp: new Date(baseTime.getTime() + 3000)
      }
      expect(deduplicator.isDuplicate(entry4)).toBe(false)

      // But entry2 and entry3 should still be duplicates
      expect(deduplicator.isDuplicate(entry2)).toBe(true)
      expect(deduplicator.isDuplicate(entry3)).toBe(true)
      // Check that entry1 was evicted (no longer a duplicate when we try it again)
      // Note: This will re-add entry1 to the cache
      expect(deduplicator.isDuplicate(entry1)).toBe(false)
    })

    it('should track cache size correctly', () => {
      const deduplicator = new LogDeduplicator({
        enabled: true,
        maxCacheEntries: 5
      })

      for (let i = 0; i < 5; i++) {
        const entry: LogEntry = {
          message: `Message ${i}`,
          level: 'info',
          timestamp: new Date()
        }
        deduplicator.isDuplicate(entry)
      }

      const stats = deduplicator.getStats()
      expect(stats.cacheSize).toBe(5)
      expect(stats.uniqueLogs).toBe(5)
    })

    it('should maintain cache size limit', () => {
      const deduplicator = new LogDeduplicator({
        enabled: true,
        maxCacheEntries: 10
      })

      // Add 20 unique messages
      for (let i = 0; i < 20; i++) {
        const entry: LogEntry = {
          message: `Message ${i}`,
          level: 'info',
          timestamp: new Date(Date.now() + i * 1000) // Different timestamps
        }
        deduplicator.isDuplicate(entry)
      }

      const stats = deduplicator.getStats()
      expect(stats.cacheSize).toBeLessThanOrEqual(10)
      expect(stats.uniqueLogs).toBe(20) // All were unique
    })

    it('should clear cache correctly', () => {
      const deduplicator = new LogDeduplicator({
        enabled: true
      })

      // Add some entries
      for (let i = 0; i < 5; i++) {
        const entry: LogEntry = {
          message: `Message ${i}`,
          level: 'info',
          timestamp: new Date()
        }
        deduplicator.isDuplicate(entry)
      }

      let stats = deduplicator.getStats()
      expect(stats.cacheSize).toBe(5)

      // Clear the cache
      deduplicator.clear()

      stats = deduplicator.getStats()
      expect(stats.cacheSize).toBe(0)
      expect(stats.totalLogs).toBe(0)
      expect(stats.uniqueLogs).toBe(0)
      expect(stats.duplicatesRemoved).toBe(0)
    })

    it('should handle cache with includeSources option', () => {
      const deduplicator = new LogDeduplicator({
        enabled: true,
        includeSources: true,
        maxCacheEntries: 3
      })

      const entry: LogEntry = {
        message: 'Repeated message',
        level: 'info',
        timestamp: new Date(),
        testId: 'test-1'
      }

      // First occurrence
      expect(deduplicator.isDuplicate(entry)).toBe(false)

      // Same message within the same test should deduplicate
      const duplicate: LogEntry = {
        ...entry,
        timestamp: new Date(entry.timestamp.getTime() + 1)
      }
      expect(deduplicator.isDuplicate(duplicate)).toBe(true)

      const key = deduplicator.generateKey(entry)
      const metadata = deduplicator.getMetadata(key)
      expect(metadata?.sources.size).toBe(1)
      expect(metadata?.sources.has('test-1')).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle disabled deduplication', () => {
      const deduplicator = new LogDeduplicator({
        enabled: false
      })

      const entry: LogEntry = {
        message: 'Test message',
        level: 'info',
        timestamp: new Date()
      }

      // Should never return true when disabled
      expect(deduplicator.isDuplicate(entry)).toBe(false)
      expect(deduplicator.isDuplicate(entry)).toBe(false)
      expect(deduplicator.isDuplicate(entry)).toBe(false)

      const stats = deduplicator.getStats()
      expect(stats.duplicatesRemoved).toBe(0)
    })

    it('should handle very long messages', () => {
      const deduplicator = new LogDeduplicator({
        enabled: true
      })

      const longMessage = 'x'.repeat(10000)
      const entry: LogEntry = {
        message: longMessage,
        level: 'info',
        timestamp: new Date()
      }

      expect(deduplicator.isDuplicate(entry)).toBe(false)
      expect(deduplicator.isDuplicate(entry)).toBe(true)
    })

    it('should handle unicode characters', () => {
      const deduplicator = new LogDeduplicator({
        enabled: true
      })

      const entry: LogEntry = {
        message: '测试消息 🔥 テスト',
        level: 'info',
        timestamp: new Date()
      }

      expect(deduplicator.isDuplicate(entry)).toBe(false)
      expect(deduplicator.isDuplicate(entry)).toBe(true)
    })
  })
})
