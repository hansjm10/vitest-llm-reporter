/**
 * Integration test for same log different level handling
 * Tests that logs with same content but different levels are NOT deduplicated
 * 
 * These tests MUST FAIL initially (TDD Red phase)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { DeduplicationConfig } from '../../src/types/deduplication.js'

// These imports will fail initially - implementations don't exist yet
// @ts-expect-error - Implementation doesn't exist yet (TDD)
import { LogDeduplicator } from '../../src/console/LogDeduplicator.js'
// @ts-expect-error - Implementation doesn't exist yet (TDD)
import { ConsoleCapture } from '../../src/console/capture'

describe('Integration: Same Log Different Level Handling', () => {
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

  describe('Different log levels should NOT be deduplicated', () => {
    it('should keep both debug and info logs with same message', () => {
      const testId = 'test-debug-info'
      
      consoleCapture.startCapture(testId)
      console.debug('Processing request')
      console.info('Processing request')
      const output = consoleCapture.stopCapture(testId)
      
      // Should have 2 separate entries
      expect(output.entries).toHaveLength(2)
      
      const debugEntry = output.entries.find(e => e.level === 'debug')
      const infoEntry = output.entries.find(e => e.level === 'info')
      
      expect(debugEntry).toBeDefined()
      expect(infoEntry).toBeDefined()
      expect(debugEntry?.deduplication).toBeUndefined()
      expect(infoEntry?.deduplication).toBeUndefined()
    })

    it('should keep both info and warn logs with same message', () => {
      const testId = 'test-info-warn'
      
      consoleCapture.startCapture(testId)
      console.info('Connection established')
      console.warn('Connection established')
      const output = consoleCapture.stopCapture(testId)
      
      expect(output.entries).toHaveLength(2)
      expect(output.entries[0].level).toBe('info')
      expect(output.entries[1].level).toBe('warn')
      expect(output.entries[0].message).toBe(output.entries[1].message)
    })

    it('should keep both warn and error logs with same message', () => {
      const testId = 'test-warn-error'
      
      consoleCapture.startCapture(testId)
      console.warn('Database connection failed')
      console.error('Database connection failed')
      const output = consoleCapture.stopCapture(testId)
      
      expect(output.entries).toHaveLength(2)
      
      const warnEntry = output.entries.find(e => e.level === 'warn')
      const errorEntry = output.entries.find(e => e.level === 'error')
      
      expect(warnEntry).toBeDefined()
      expect(errorEntry).toBeDefined()
      expect(warnEntry?.message).toBe('Database connection failed')
      expect(errorEntry?.message).toBe('Database connection failed')
    })

    it('should keep all different levels with same message', () => {
      const testId = 'test-all-levels'
      const message = 'System status check'
      
      consoleCapture.startCapture(testId)
      console.debug(message)
      console.log(message)
      console.info(message)
      console.warn(message)
      console.error(message)
      const output = consoleCapture.stopCapture(testId)
      
      // Should have 5 separate entries, one for each level
      expect(output.entries).toHaveLength(5)
      
      const levels = output.entries.map(e => e.level)
      expect(levels).toContain('debug')
      expect(levels).toContain('log')
      expect(levels).toContain('info')
      expect(levels).toContain('warn')
      expect(levels).toContain('error')
      
      // All should have the same message
      output.entries.forEach(entry => {
        expect(entry.message).toBe(message)
        expect(entry.deduplication).toBeUndefined()
      })
    })
  })

  describe('Mixed same and different levels', () => {
    it('should deduplicate within same level but not across levels', () => {
      const testId = 'test-mixed-levels'
      
      consoleCapture.startCapture(testId)
      console.info('Status OK')
      console.info('Status OK') // duplicate at same level
      console.warn('Status OK') // different level
      console.info('Status OK') // duplicate at same level
      console.warn('Status OK') // duplicate at warn level
      console.error('Status OK') // different level
      const output = consoleCapture.stopCapture(testId)
      
      // Should have 3 entries: info (×3), warn (×2), error (×1)
      expect(output.entries).toHaveLength(3)
      
      const infoEntry = output.entries.find(e => e.level === 'info')
      const warnEntry = output.entries.find(e => e.level === 'warn')
      const errorEntry = output.entries.find(e => e.level === 'error')
      
      expect(infoEntry?.deduplication?.count).toBe(3)
      expect(warnEntry?.deduplication?.count).toBe(2)
      expect(errorEntry?.deduplication).toBeUndefined() // Only one error
    })

    it('should handle interleaved messages at different levels', () => {
      const testId = 'test-interleaved'
      
      consoleCapture.startCapture(testId)
      console.debug('Starting process')
      console.info('Starting process')
      console.debug('Starting process') // duplicate debug
      console.warn('Starting process')
      console.info('Starting process') // duplicate info
      console.debug('Starting process') // duplicate debug
      const output = consoleCapture.stopCapture(testId)
      
      // Should have 3 entries with proper counts
      expect(output.entries).toHaveLength(3)
      
      const debugEntry = output.entries.find(e => e.level === 'debug')
      const infoEntry = output.entries.find(e => e.level === 'info')
      const warnEntry = output.entries.find(e => e.level === 'warn')
      
      expect(debugEntry?.deduplication?.count).toBe(3)
      expect(infoEntry?.deduplication?.count).toBe(2)
      expect(warnEntry?.deduplication).toBeUndefined()
    })
  })

  describe('Level-specific deduplication keys', () => {
    it('should generate different keys for same message at different levels', () => {
      const message = 'Test message'
      
      const debugKey = deduplicator.generateKey({
        message,
        level: 'debug',
        timestamp: new Date(),
      })
      
      const infoKey = deduplicator.generateKey({
        message,
        level: 'info',
        timestamp: new Date(),
      })
      
      const errorKey = deduplicator.generateKey({
        message,
        level: 'error',
        timestamp: new Date(),
      })
      
      // All keys should be different
      expect(debugKey).not.toBe(infoKey)
      expect(infoKey).not.toBe(errorKey)
      expect(debugKey).not.toBe(errorKey)
      
      // Keys should include level prefix
      expect(debugKey).toContain('debug:')
      expect(infoKey).toContain('info:')
      expect(errorKey).toContain('error:')
    })

    it('should generate same key for same message at same level', () => {
      const message = 'Consistent message'
      
      const key1 = deduplicator.generateKey({
        message,
        level: 'warn',
        timestamp: new Date(),
        testId: 'test-1',
      })
      
      const key2 = deduplicator.generateKey({
        message,
        level: 'warn',
        timestamp: new Date(),
        testId: 'test-2',
      })
      
      expect(key1).toBe(key2)
    })
  })

  describe('Statistics for different levels', () => {
    it('should count unique logs per level correctly', () => {
      const testId = 'test-level-stats'
      
      consoleCapture.startCapture(testId)
      // Total: 9 logs
      console.debug('Message A')
      console.debug('Message A') // duplicate
      console.info('Message A')  // different level
      console.info('Message A')  // duplicate at info
      console.info('Message A')  // duplicate at info
      console.warn('Message A')  // different level
      console.error('Message A') // different level
      console.error('Message A') // duplicate at error
      console.error('Message A') // duplicate at error
      const output = consoleCapture.stopCapture(testId)
      
      const stats = output.deduplicationStats
      expect(stats.totalLogs).toBe(9)
      expect(stats.uniqueLogs).toBe(4) // 1 debug, 1 info, 1 warn, 1 error
      expect(stats.duplicatesRemoved).toBe(5) // 1 + 2 + 0 + 2
    })

    it('should maintain separate counts for each level', () => {
      const testId = 'test-separate-counts'
      
      consoleCapture.startCapture(testId)
      // Log same message 3 times at each level
      for (let i = 0; i < 3; i++) {
        console.debug('Repeated')
        console.info('Repeated')
        console.warn('Repeated')
        console.error('Repeated')
      }
      const output = consoleCapture.stopCapture(testId)
      
      // Should have 4 entries (one per level)
      expect(output.entries).toHaveLength(4)
      
      // Each should have count of 3
      output.entries.forEach(entry => {
        expect(entry.message).toBe('Repeated')
        expect(entry.deduplication?.count).toBe(3)
      })
      
      const stats = output.deduplicationStats
      expect(stats.totalLogs).toBe(12) // 3 × 4 levels
      expect(stats.uniqueLogs).toBe(4)  // 1 per level
      expect(stats.duplicatesRemoved).toBe(8) // 2 duplicates × 4 levels
    })
  })

  describe('Source tracking with different levels', () => {
    it('should track sources separately for each level', () => {
      const message = 'Shared message'
      
      consoleCapture.captureForTest('test-1', () => {
        console.debug(message)
        console.info(message)
      })
      
      consoleCapture.captureForTest('test-2', () => {
        console.debug(message) // duplicate debug from test-1
        console.warn(message)  // new level
      })
      
      consoleCapture.captureForTest('test-3', () => {
        console.info(message)  // duplicate info from test-1
        console.warn(message)  // duplicate warn from test-2
      })
      
      const summary = consoleCapture.getDeduplicationSummary()
      
      // Should have 3 entries (debug, info, warn)
      const debugEntry = summary.entries.find(e => 
        e.level === 'debug' && e.message === message
      )
      const infoEntry = summary.entries.find(e => 
        e.level === 'info' && e.message === message
      )
      const warnEntry = summary.entries.find(e => 
        e.level === 'warn' && e.message === message
      )
      
      // Debug: test-1, test-2
      expect(debugEntry?.deduplication?.count).toBe(2)
      expect(debugEntry?.deduplication?.sources).toContain('test-1')
      expect(debugEntry?.deduplication?.sources).toContain('test-2')
      
      // Info: test-1, test-3
      expect(infoEntry?.deduplication?.count).toBe(2)
      expect(infoEntry?.deduplication?.sources).toContain('test-1')
      expect(infoEntry?.deduplication?.sources).toContain('test-3')
      
      // Warn: test-2, test-3
      expect(warnEntry?.deduplication?.count).toBe(2)
      expect(warnEntry?.deduplication?.sources).toContain('test-2')
      expect(warnEntry?.deduplication?.sources).toContain('test-3')
    })
  })
})