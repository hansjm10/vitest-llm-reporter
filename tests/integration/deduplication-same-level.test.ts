/**
 * Integration test for same log same level deduplication
 * Tests that duplicate logs at the same level are properly deduplicated
 * 
 * These tests MUST FAIL initially (TDD Red phase)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { 
  createLogEntry,
  createDuplicateLogEntries,
  MockLogDeduplicator
} from '../utils/deduplication-helpers.js'
import type { DeduplicationConfig } from '../../src/types/deduplication.js'

// These imports will fail initially - implementations don't exist yet
// @ts-expect-error - Implementation doesn't exist yet (TDD)
import { LogDeduplicator } from '../../src/console/LogDeduplicator.js'
// @ts-expect-error - Implementation doesn't exist yet (TDD)
import { ConsoleCapture } from '../../src/console/ConsoleCapture.js'
// @ts-expect-error - Implementation doesn't exist yet (TDD)
import { ConsoleBuffer } from '../../src/console/ConsoleBuffer.js'

describe('Integration: Same Log Same Level Deduplication', () => {
  let consoleCapture: any // ConsoleCapture
  let deduplicator: any // ILogDeduplicator
  let config: DeduplicationConfig

  beforeEach(() => {
    config = {
      enabled: true,
      maxCacheEntries: 1000,
      includeSources: true,
      normalizeWhitespace: true,
      stripTimestamps: true,
      stripAnsiCodes: true,
    }

    // Create real instances for integration testing
    // @ts-expect-error - Implementation doesn't exist yet (TDD)
    deduplicator = new LogDeduplicator(config)
    
    // @ts-expect-error - Implementation doesn't exist yet (TDD)
    consoleCapture = new ConsoleCapture({
      deduplicator,
      enabled: true,
    })
  })

  afterEach(() => {
    // Clean up
    if (consoleCapture?.restore) {
      consoleCapture.restore()
    }
    if (deduplicator?.clear) {
      deduplicator.clear()
    }
  })

  describe('Basic deduplication', () => {
    it('should deduplicate identical console.log messages', () => {
      const testId = 'test-identical-logs'
      
      // Simulate multiple identical logs
      consoleCapture.startCapture(testId)
      console.log('Duplicate message')
      console.log('Duplicate message')
      console.log('Duplicate message')
      const output = consoleCapture.stopCapture(testId)
      
      // Should only have one entry with count metadata
      expect(output.entries).toHaveLength(1)
      expect(output.entries[0].message).toBe('Duplicate message')
      expect(output.entries[0].deduplication?.count).toBe(3)
      expect(output.entries[0].deduplication?.deduplicated).toBe(true)
    })

    it('should deduplicate identical console.error messages', () => {
      const testId = 'test-identical-errors'
      
      consoleCapture.startCapture(testId)
      console.error('Error occurred')
      console.error('Error occurred')
      console.error('Error occurred')
      console.error('Error occurred')
      const output = consoleCapture.stopCapture(testId)
      
      expect(output.entries).toHaveLength(1)
      expect(output.entries[0].message).toBe('Error occurred')
      expect(output.entries[0].level).toBe('error')
      expect(output.entries[0].deduplication?.count).toBe(4)
    })

    it('should deduplicate identical console.warn messages', () => {
      const testId = 'test-identical-warnings'
      
      consoleCapture.startCapture(testId)
      console.warn('Warning message')
      console.warn('Warning message')
      const output = consoleCapture.stopCapture(testId)
      
      expect(output.entries).toHaveLength(1)
      expect(output.entries[0].level).toBe('warn')
      expect(output.entries[0].deduplication?.count).toBe(2)
    })

    it('should deduplicate identical console.info messages', () => {
      const testId = 'test-identical-info'
      
      consoleCapture.startCapture(testId)
      console.info('Information')
      console.info('Information')
      console.info('Information')
      const output = consoleCapture.stopCapture(testId)
      
      expect(output.entries).toHaveLength(1)
      expect(output.entries[0].level).toBe('info')
      expect(output.entries[0].deduplication?.count).toBe(3)
    })

    it('should deduplicate identical console.debug messages', () => {
      const testId = 'test-identical-debug'
      
      consoleCapture.startCapture(testId)
      console.debug('Debug info')
      console.debug('Debug info')
      console.debug('Debug info')
      console.debug('Debug info')
      console.debug('Debug info')
      const output = consoleCapture.stopCapture(testId)
      
      expect(output.entries).toHaveLength(1)
      expect(output.entries[0].level).toBe('debug')
      expect(output.entries[0].deduplication?.count).toBe(5)
    })
  })

  describe('Mixed unique and duplicate messages', () => {
    it('should preserve unique messages while deduplicating duplicates', () => {
      const testId = 'test-mixed-messages'
      
      consoleCapture.startCapture(testId)
      console.log('First unique message')
      console.log('Duplicate message')
      console.log('Second unique message')
      console.log('Duplicate message')
      console.log('Third unique message')
      console.log('Duplicate message')
      const output = consoleCapture.stopCapture(testId)
      
      // Should have 4 entries: 3 unique + 1 deduplicated
      expect(output.entries).toHaveLength(4)
      
      // Find the deduplicated entry
      const dedupEntry = output.entries.find(e => 
        e.message === 'Duplicate message'
      )
      expect(dedupEntry?.deduplication?.count).toBe(3)
      
      // Verify unique messages don't have deduplication metadata
      const uniqueEntries = output.entries.filter(e => 
        e.message.includes('unique')
      )
      uniqueEntries.forEach(entry => {
        expect(entry.deduplication).toBeUndefined()
      })
    })

    it('should maintain order of first occurrence', () => {
      const testId = 'test-order-preservation'
      
      consoleCapture.startCapture(testId)
      console.log('Message A')
      console.log('Message B')
      console.log('Message A') // duplicate
      console.log('Message C')
      console.log('Message B') // duplicate
      console.log('Message A') // duplicate
      const output = consoleCapture.stopCapture(testId)
      
      expect(output.entries).toHaveLength(3)
      expect(output.entries[0].message).toBe('Message A')
      expect(output.entries[1].message).toBe('Message B')
      expect(output.entries[2].message).toBe('Message C')
      
      expect(output.entries[0].deduplication?.count).toBe(3)
      expect(output.entries[1].deduplication?.count).toBe(2)
      expect(output.entries[2].deduplication).toBeUndefined()
    })
  })

  describe('Normalization during deduplication', () => {
    it('should deduplicate messages with different whitespace', () => {
      const testId = 'test-whitespace-normalization'
      
      consoleCapture.startCapture(testId)
      console.log('Message    with   spaces')
      console.log('Message with spaces')
      console.log('Message  with    spaces')
      const output = consoleCapture.stopCapture(testId)
      
      expect(output.entries).toHaveLength(1)
      expect(output.entries[0].deduplication?.count).toBe(3)
    })

    it('should deduplicate messages with timestamps stripped', () => {
      const testId = 'test-timestamp-stripping'
      
      consoleCapture.startCapture(testId)
      console.log('Event at 2024-01-01T10:00:00.000Z')
      console.log('Event at 2024-01-01T11:00:00.000Z')
      console.log('Event at 2024-01-01T12:00:00.000Z')
      const output = consoleCapture.stopCapture(testId)
      
      expect(output.entries).toHaveLength(1)
      expect(output.entries[0].deduplication?.count).toBe(3)
    })

    it('should deduplicate messages with ANSI codes stripped', () => {
      const testId = 'test-ansi-stripping'
      
      consoleCapture.startCapture(testId)
      console.log('\x1b[31mRed text\x1b[0m')
      console.log('\x1b[32mRed text\x1b[0m') // Different color, same text
      console.log('Red text') // No color
      const output = consoleCapture.stopCapture(testId)
      
      expect(output.entries).toHaveLength(1)
      expect(output.entries[0].deduplication?.count).toBe(3)
    })
  })

  describe('Source tracking', () => {
    it('should track test IDs that generated duplicate logs', () => {
      // Simulate multiple tests logging the same message
      const test1Output = consoleCapture.captureForTest('test-1', () => {
        console.log('Shared message')
      })
      
      const test2Output = consoleCapture.captureForTest('test-2', () => {
        console.log('Shared message')
      })
      
      const test3Output = consoleCapture.captureForTest('test-3', () => {
        console.log('Shared message')
      })
      
      // Get aggregated results
      const summary = consoleCapture.getDeduplicationSummary()
      const sharedEntry = summary.entries.find(e => 
        e.message === 'Shared message'
      )
      
      expect(sharedEntry?.deduplication?.count).toBe(3)
      expect(sharedEntry?.deduplication?.sources).toContain('test-1')
      expect(sharedEntry?.deduplication?.sources).toContain('test-2')
      expect(sharedEntry?.deduplication?.sources).toContain('test-3')
    })

    it('should handle mixed sources correctly', () => {
      consoleCapture.captureForTest('test-a', () => {
        console.log('Message 1')
        console.log('Message 2')
      })
      
      consoleCapture.captureForTest('test-b', () => {
        console.log('Message 2') // duplicate from test-a
        console.log('Message 3')
      })
      
      consoleCapture.captureForTest('test-c', () => {
        console.log('Message 1') // duplicate from test-a
        console.log('Message 3') // duplicate from test-b
      })
      
      const summary = consoleCapture.getDeduplicationSummary()
      
      const msg1 = summary.entries.find(e => e.message === 'Message 1')
      expect(msg1?.deduplication?.count).toBe(2)
      expect(msg1?.deduplication?.sources).toHaveLength(2)
      
      const msg2 = summary.entries.find(e => e.message === 'Message 2')
      expect(msg2?.deduplication?.count).toBe(2)
      expect(msg2?.deduplication?.sources).toHaveLength(2)
      
      const msg3 = summary.entries.find(e => e.message === 'Message 3')
      expect(msg3?.deduplication?.count).toBe(2)
      expect(msg3?.deduplication?.sources).toHaveLength(2)
    })
  })

  describe('Statistics tracking', () => {
    it('should provide accurate deduplication statistics', () => {
      const testId = 'test-statistics'
      
      consoleCapture.startCapture(testId)
      // 10 total logs, 3 unique
      console.log('Message A')
      console.log('Message A')
      console.log('Message A')
      console.log('Message B')
      console.log('Message B')
      console.log('Message B')
      console.log('Message B')
      console.log('Message C')
      console.log('Message C')
      console.log('Message C')
      const output = consoleCapture.stopCapture(testId)
      
      const stats = output.deduplicationStats
      expect(stats.totalLogs).toBe(10)
      expect(stats.uniqueLogs).toBe(3)
      expect(stats.duplicatesRemoved).toBe(7)
    })

    it('should track statistics across multiple test runs', () => {
      consoleCapture.captureForTest('test-1', () => {
        console.log('Msg 1')
        console.log('Msg 1')
        console.log('Msg 2')
      })
      
      consoleCapture.captureForTest('test-2', () => {
        console.log('Msg 1') // duplicate from test-1
        console.log('Msg 3')
        console.log('Msg 3')
      })
      
      const globalStats = consoleCapture.getGlobalDeduplicationStats()
      expect(globalStats.totalLogs).toBe(6)
      expect(globalStats.uniqueLogs).toBe(3)
      expect(globalStats.duplicatesRemoved).toBe(3)
    })
  })
})