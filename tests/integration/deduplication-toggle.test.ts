/**
 * Integration test for configuration toggle (enable/disable)
 * Tests that deduplication can be enabled and disabled via configuration
 * 
 * These tests MUST FAIL initially (TDD Red phase)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { DeduplicationConfig } from '../../src/types/deduplication.js'
import type { LLMReporterConfigWithDeduplication } from '../../src/config/deduplication-config.js'

// These imports will fail initially - implementations don't exist yet
// @ts-expect-error - Implementation doesn't exist yet (TDD)
import { LogDeduplicator } from '../../src/console/LogDeduplicator'
// @ts-expect-error - Implementation doesn't exist yet (TDD)
import { ConsoleCapture } from '../../src/console/capture'
// @ts-expect-error - Implementation doesn't exist yet (TDD)
// @ts-expect-error - Using actual reporter.ts file
import { LLMReporter } from '../../src/reporter/reporter'

describe('Integration: Configuration Toggle', () => {
  describe('LogDeduplicator enable/disable', () => {
    it('should deduplicate when enabled', () => {
      const config: DeduplicationConfig = {
        enabled: true,
        maxCacheEntries: 1000,
      }
      
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const deduplicator = new LogDeduplicator(config)
      
      const log1 = {
        message: 'Test message',
        level: 'info' as const,
        timestamp: new Date(),
        testId: 'test-1',
      }
      
      const log2 = {
        message: 'Test message',
        level: 'info' as const,
        timestamp: new Date(),
        testId: 'test-2',
      }
      
      expect(deduplicator.isDuplicate(log1)).toBe(false)
      expect(deduplicator.isDuplicate(log2)).toBe(true) // Should be deduplicated
    })

    it('should NOT deduplicate when disabled', () => {
      const config: DeduplicationConfig = {
        enabled: false,
        maxCacheEntries: 1000,
      }
      
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const deduplicator = new LogDeduplicator(config)
      
      const log1 = {
        message: 'Test message',
        level: 'info' as const,
        timestamp: new Date(),
        testId: 'test-1',
      }
      
      const log2 = {
        message: 'Test message',
        level: 'info' as const,
        timestamp: new Date(),
        testId: 'test-2',
      }
      
      expect(deduplicator.isDuplicate(log1)).toBe(false)
      expect(deduplicator.isDuplicate(log2)).toBe(false) // Should NOT be deduplicated
    })

    it('should respect isEnabled() method', () => {
      const enabledConfig: DeduplicationConfig = {
        enabled: true,
      }
      const disabledConfig: DeduplicationConfig = {
        enabled: false,
      }
      
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const enabledDedup = new LogDeduplicator(enabledConfig)
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const disabledDedup = new LogDeduplicator(disabledConfig)
      
      expect(enabledDedup.isEnabled()).toBe(true)
      expect(disabledDedup.isEnabled()).toBe(false)
    })
  })

  describe('ConsoleCapture integration', () => {
    it('should use deduplication when provided enabled deduplicator', () => {
      const config: DeduplicationConfig = {
        enabled: true,
      }
      
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const deduplicator = new LogDeduplicator(config)
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const consoleCapture = new ConsoleCapture({
        deduplicator,
        enabled: true,
      })
      
      const testId = 'test-with-dedup'
      consoleCapture.startCapture(testId)
      console.log('Duplicate')
      console.log('Duplicate')
      console.log('Duplicate')
      const output = consoleCapture.stopCapture(testId)
      
      expect(output.entries).toHaveLength(1)
      expect(output.entries[0].deduplication?.count).toBe(3)
      
      consoleCapture.restore()
    })

    it('should not deduplicate when deduplicator is disabled', () => {
      const config: DeduplicationConfig = {
        enabled: false,
      }
      
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const deduplicator = new LogDeduplicator(config)
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const consoleCapture = new ConsoleCapture({
        deduplicator,
        enabled: true,
      })
      
      const testId = 'test-without-dedup'
      consoleCapture.startCapture(testId)
      console.log('Duplicate')
      console.log('Duplicate')
      console.log('Duplicate')
      const output = consoleCapture.stopCapture(testId)
      
      expect(output.entries).toHaveLength(3)
      output.entries.forEach(entry => {
        expect(entry.deduplication).toBeUndefined()
      })
      
      consoleCapture.restore()
    })

    it('should not deduplicate when no deduplicator provided', () => {
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const consoleCapture = new ConsoleCapture({
        enabled: true,
        // No deduplicator provided
      })
      
      const testId = 'test-no-dedup'
      consoleCapture.startCapture(testId)
      console.log('Message')
      console.log('Message')
      const output = consoleCapture.stopCapture(testId)
      
      expect(output.entries).toHaveLength(2)
      expect(output.entries[0].deduplication).toBeUndefined()
      expect(output.entries[1].deduplication).toBeUndefined()
      
      consoleCapture.restore()
    })
  })

  describe('LLMReporter configuration', () => {
    it('should enable deduplication with boolean true', () => {
      const config: LLMReporterConfigWithDeduplication = {
        deduplicateLogs: true,
      }
      
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const reporter = new LLMReporter(config)
      
      // Simulate test run with duplicate logs
      const testContext = {
        testId: 'test-1',
        logs: [
          { message: 'Duplicate', level: 'info' },
          { message: 'Duplicate', level: 'info' },
          { message: 'Duplicate', level: 'info' },
        ],
      }
      
      const output = reporter.processTestOutput(testContext)
      expect(output.console).toHaveLength(1)
      expect(output.console[0].deduplication?.count).toBe(3)
    })

    it('should disable deduplication with boolean false', () => {
      const config: LLMReporterConfigWithDeduplication = {
        deduplicateLogs: false,
      }
      
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const reporter = new LLMReporter(config)
      
      const testContext = {
        testId: 'test-1',
        logs: [
          { message: 'Duplicate', level: 'info' },
          { message: 'Duplicate', level: 'info' },
        ],
      }
      
      const output = reporter.processTestOutput(testContext)
      expect(output.console).toHaveLength(2)
      expect(output.console[0].deduplication).toBeUndefined()
      expect(output.console[1].deduplication).toBeUndefined()
    })

    it('should disable deduplication when undefined', () => {
      const config: LLMReporterConfigWithDeduplication = {
        // deduplicateLogs not specified
        verbose: true,
      }
      
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const reporter = new LLMReporter(config)
      
      const testContext = {
        testId: 'test-1',
        logs: [
          { message: 'Message', level: 'info' },
          { message: 'Message', level: 'info' },
        ],
      }
      
      const output = reporter.processTestOutput(testContext)
      expect(output.console).toHaveLength(2)
    })

    it('should accept detailed configuration object', () => {
      const config: LLMReporterConfigWithDeduplication = {
        deduplicateLogs: {
          enabled: true,
          maxCacheEntries: 500,
          includeSources: true,
          normalizeWhitespace: false,
          stripTimestamps: false,
          stripAnsiCodes: true,
        },
      }
      
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const reporter = new LLMReporter(config)
      
      const testContext = {
        testId: 'test-1',
        logs: [
          { message: 'Message   with  spaces', level: 'info' },
          { message: 'Message with spaces', level: 'info' }, // Different whitespace
        ],
      }
      
      const output = reporter.processTestOutput(testContext)
      // With normalizeWhitespace: false, these should NOT be deduplicated
      expect(output.console).toHaveLength(2)
    })

    it('should toggle deduplication during runtime', () => {
      const config: LLMReporterConfigWithDeduplication = {
        deduplicateLogs: true,
      }
      
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const reporter = new LLMReporter(config)
      
      // Process with deduplication enabled
      const context1 = {
        testId: 'test-1',
        logs: [
          { message: 'Msg', level: 'info' },
          { message: 'Msg', level: 'info' },
        ],
      }
      
      const output1 = reporter.processTestOutput(context1)
      expect(output1.console).toHaveLength(1)
      expect(output1.console[0].deduplication?.count).toBe(2)
      
      // Disable deduplication
      reporter.updateConfig({ deduplicateLogs: false })
      
      // Process with deduplication disabled
      const context2 = {
        testId: 'test-2',
        logs: [
          { message: 'Msg', level: 'info' },
          { message: 'Msg', level: 'info' },
        ],
      }
      
      const output2 = reporter.processTestOutput(context2)
      expect(output2.console).toHaveLength(2)
      
      // Re-enable deduplication
      reporter.updateConfig({ deduplicateLogs: true })
      
      // Process with deduplication re-enabled
      const context3 = {
        testId: 'test-3',
        logs: [
          { message: 'Msg', level: 'info' },
          { message: 'Msg', level: 'info' },
        ],
      }
      
      const output3 = reporter.processTestOutput(context3)
      expect(output3.console).toHaveLength(1)
      expect(output3.console[0].deduplication?.count).toBe(2)
    })
  })

  describe('Configuration validation', () => {
    it('should handle invalid configuration gracefully', () => {
      const invalidConfigs = [
        { deduplicateLogs: 'yes' }, // string instead of boolean
        { deduplicateLogs: 1 }, // number instead of boolean
        { deduplicateLogs: { enabled: 'true' } }, // string instead of boolean
        { deduplicateLogs: { maxCacheEntries: -100 } }, // negative number
        { deduplicateLogs: { maxCacheEntries: 0 } }, // zero
      ]
      
      invalidConfigs.forEach(config => {
        expect(() => {
          // @ts-expect-error - Testing invalid config
          const reporter = new LLMReporter(config)
        }).toThrow()
      })
    })

    it('should apply defaults for partial configuration', () => {
      const partialConfig: LLMReporterConfigWithDeduplication = {
        deduplicateLogs: {
          enabled: true,
          // Other fields should use defaults
        },
      }
      
      // @ts-expect-error - Implementation doesn't exist yet (TDD)
      const reporter = new LLMReporter(partialConfig)
      const internalConfig = reporter.getDeduplicationConfig()
      
      expect(internalConfig.enabled).toBe(true)
      expect(internalConfig.maxCacheEntries).toBe(10000) // default
      expect(internalConfig.includeSources).toBe(false) // default
      expect(internalConfig.normalizeWhitespace).toBe(true) // default
      expect(internalConfig.stripTimestamps).toBe(true) // default
      expect(internalConfig.stripAnsiCodes).toBe(true) // default
    })
  })
})