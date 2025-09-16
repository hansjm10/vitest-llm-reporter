/**
 * Integration test for configuration toggle (enable/disable)
 * Tests that deduplication can be enabled and disabled via configuration
 *
 * These tests MUST FAIL initially (TDD Red phase)
 */

import { describe, it, expect, afterEach } from 'vitest'
import type { DeduplicationConfig } from '../../src/types/deduplication.js'
import type { LLMReporterConfigWithDeduplication } from '../../src/config/deduplication-config.js'
import { LogDeduplicator } from '../../src/console/LogDeduplicator.js'
import { ConsoleCapture } from '../../src/console/capture.js'
import { LLMReporter } from '../../src/reporter/reporter.js'
import { consoleCapture } from '../../src/console/index.js'

describe('Integration: Configuration Toggle', () => {
  describe('LogDeduplicator enable/disable', () => {
    it('should deduplicate when enabled', () => {
      const config: DeduplicationConfig = {
        enabled: true,
        maxCacheEntries: 1000
      }

      const deduplicator = new LogDeduplicator(config)

      const log1 = {
        message: 'Test message',
        level: 'info' as const,
        timestamp: new Date(),
        testId: 'test-1'
      }

      const log2 = {
        message: 'Test message',
        level: 'info' as const,
        timestamp: new Date(),
        testId: 'test-1'
      }

      expect(deduplicator.isDuplicate(log1)).toBe(false)
      expect(deduplicator.isDuplicate(log2)).toBe(true) // Should be deduplicated
    })

    it('should NOT deduplicate when disabled', () => {
      const config: DeduplicationConfig = {
        enabled: false,
        maxCacheEntries: 1000
      }

      const deduplicator = new LogDeduplicator(config)

      const log1 = {
        message: 'Test message',
        level: 'info' as const,
        timestamp: new Date(),
        testId: 'test-1'
      }

      const log2 = {
        message: 'Test message',
        level: 'info' as const,
        timestamp: new Date(),
        testId: 'test-2'
      }

      expect(deduplicator.isDuplicate(log1)).toBe(false)
      expect(deduplicator.isDuplicate(log2)).toBe(false) // Should NOT be deduplicated
    })

    it('should respect isEnabled() method', () => {
      const enabledConfig: DeduplicationConfig = {
        enabled: true
      }
      const disabledConfig: DeduplicationConfig = {
        enabled: false
      }

      const enabledDedup = new LogDeduplicator(enabledConfig)
      const disabledDedup = new LogDeduplicator(disabledConfig)

      expect(enabledDedup.isEnabled()).toBe(true)
      expect(disabledDedup.isEnabled()).toBe(false)
    })
  })

  describe('ConsoleCapture integration', () => {
    it('should use deduplication when provided enabled deduplicator', () => {
      const config: DeduplicationConfig = {
        enabled: true
      }

      const deduplicator = new LogDeduplicator(config)
      const consoleCapture = new ConsoleCapture({
        deduplicator,
        enabled: true
      })

      const testId = 'test-with-dedup'
      consoleCapture.startCapture(testId)
      // Use ingest to simulate console output since we're not in async context
      consoleCapture.ingest(testId, 'log', ['Duplicate'])
      consoleCapture.ingest(testId, 'log', ['Duplicate'])
      consoleCapture.ingest(testId, 'log', ['Duplicate'])
      const output = consoleCapture.stopCapture(testId)

      expect(output.entries).toHaveLength(1)
      expect(output.entries[0].deduplication?.count).toBe(3)

      consoleCapture.unpatchConsole()
    })

    it('should not deduplicate when deduplicator is disabled', () => {
      const config: DeduplicationConfig = {
        enabled: false
      }

      const deduplicator = new LogDeduplicator(config)
      const consoleCapture = new ConsoleCapture({
        deduplicator,
        enabled: true
      })

      const testId = 'test-without-dedup'
      consoleCapture.startCapture(testId)
      // Use ingest to simulate console output since we're not in async context
      consoleCapture.ingest(testId, 'log', ['Duplicate'])
      consoleCapture.ingest(testId, 'log', ['Duplicate'])
      consoleCapture.ingest(testId, 'log', ['Duplicate'])
      const output = consoleCapture.stopCapture(testId)

      expect(output.entries).toHaveLength(3)
      output.entries.forEach((entry) => {
        expect(entry.deduplication).toBeUndefined()
      })

      consoleCapture.unpatchConsole()
    })

    it('should not deduplicate when no deduplicator provided', () => {
      const consoleCapture = new ConsoleCapture({
        enabled: true
        // No deduplicator provided
      })

      const testId = 'test-no-dedup'
      consoleCapture.startCapture(testId)
      // Use ingest to simulate console output since we're not in async context
      consoleCapture.ingest(testId, 'log', ['Message'])
      consoleCapture.ingest(testId, 'log', ['Message'])
      const output = consoleCapture.stopCapture(testId)

      expect(output.entries).toHaveLength(2)
      expect(output.entries[0].deduplication).toBeUndefined()
      expect(output.entries[1].deduplication).toBeUndefined()

      consoleCapture.unpatchConsole()
    })
  })

  describe('Configuration validation', () => {
    it('should handle invalid configuration gracefully', () => {
      const invalidConfigs = [
        { deduplicateLogs: 'yes' }, // string instead of boolean
        { deduplicateLogs: 1 }, // number instead of boolean
        { deduplicateLogs: { enabled: 'true' } }, // string instead of boolean
        { deduplicateLogs: { maxCacheEntries: -100 } }, // negative number
        { deduplicateLogs: { maxCacheEntries: 0 } } // zero
      ]

      invalidConfigs.forEach((config) => {
        expect(() => {
          new LLMReporter(config)
        }).toThrow()
      })
    })

    it('should apply defaults for partial configuration', () => {
      const partialConfig: LLMReporterConfigWithDeduplication = {
        deduplicateLogs: {
          enabled: true
          // Other fields should use defaults
        }
      }

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

  describe('Reporter configuration updates', () => {
    afterEach(() => {
      consoleCapture.reset()
    })

    it('should toggle deduplication at runtime', () => {
      const reporter = new LLMReporter({
        captureConsoleOnFailure: true,
        deduplicateLogs: true
      })

      expect(consoleCapture.deduplicator?.isEnabled()).toBe(true)

      reporter.updateConfig({ deduplicateLogs: false })
      expect(consoleCapture.deduplicator?.isEnabled()).toBe(false)

      reporter.updateConfig({ deduplicateLogs: true })
      expect(consoleCapture.deduplicator?.isEnabled()).toBe(true)
    })
  })
})
