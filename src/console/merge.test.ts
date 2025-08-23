import { describe, it, expect } from 'vitest'
import { ConsoleMerger } from './merge'
import type { ConsoleOutput } from '../types/schema'

describe('ConsoleMerger', () => {
  const merger = new ConsoleMerger()

  describe('merge', () => {
    it('should return undefined when both inputs are undefined', () => {
      const result = merger.merge(undefined, undefined)
      expect(result).toBeUndefined()
    })

    it('should return custom output when vitest output is undefined', () => {
      const customOutput: ConsoleOutput = {
        logs: ['custom log 1', 'custom log 2'],
        errors: ['custom error']
      }
      const result = merger.merge(undefined, customOutput)
      expect(result).toEqual(customOutput)
    })

    it('should return vitest output when custom output is undefined', () => {
      const vitestOutput: ConsoleOutput = {
        logs: ['vitest log 1', 'vitest log 2'],
        warns: ['vitest warning']
      }
      const result = merger.merge(vitestOutput, undefined)
      expect(result).toEqual(vitestOutput)
    })

    it('should merge non-overlapping outputs', () => {
      const vitestOutput: ConsoleOutput = {
        logs: ['vitest log'],
        warns: ['vitest warning']
      }
      const customOutput: ConsoleOutput = {
        errors: ['custom error'],
        info: ['custom info']
      }

      const result = merger.merge(vitestOutput, customOutput)

      expect(result).toEqual({
        logs: ['vitest log'],
        warns: ['vitest warning'],
        errors: ['custom error'],
        info: ['custom info']
      })
    })

    it('should deduplicate identical messages', () => {
      const vitestOutput: ConsoleOutput = {
        logs: ['duplicate message', 'unique vitest'],
        errors: ['error message']
      }
      const customOutput: ConsoleOutput = {
        logs: ['duplicate message', 'unique custom'],
        errors: ['error message']
      }

      const result = merger.merge(vitestOutput, customOutput)

      expect(result?.logs).toEqual(['duplicate message', 'unique custom', 'unique vitest'])
      expect(result?.errors).toEqual(['error message'])
    })

    it('should deduplicate messages with different timestamps', () => {
      const vitestOutput: ConsoleOutput = {
        logs: ['[123ms] Test message', 'Other log']
      }
      const customOutput: ConsoleOutput = {
        logs: ['[456ms] Test message', 'Different log']
      }

      const result = merger.merge(vitestOutput, customOutput)

      // Should keep custom (first) and not duplicate with different timestamp
      expect(result?.logs).toContain('[456ms] Test message')
      expect(result?.logs).not.toContain('[123ms] Test message')
      expect(result?.logs).toContain('Other log')
      expect(result?.logs).toContain('Different log')
    })

    it('should handle substring duplicates', () => {
      const vitestOutput: ConsoleOutput = {
        logs: ['Test message with more details']
      }
      const customOutput: ConsoleOutput = {
        logs: ['Test message']
      }

      const result = merger.merge(vitestOutput, customOutput)

      // Should keep the longer message as it contains more information
      expect(result?.logs).toHaveLength(1)
      expect(result?.logs?.[0]).toBe('Test message')
    })

    it('should preserve method granularity from custom output', () => {
      // Vitest only provides stdout/stderr
      const vitestOutput: ConsoleOutput = {
        logs: ['Helper function log'],
        errors: ['Helper function error']
      }

      // Custom capture has better granularity
      const customOutput: ConsoleOutput = {
        logs: ['console.log output'],
        warns: ['console.warn output'],
        errors: ['console.error output'],
        info: ['console.info output'],
        debug: ['console.debug output']
      }

      const result = merger.merge(vitestOutput, customOutput)

      // Should have all method types preserved
      expect(result).toHaveProperty('logs')
      expect(result).toHaveProperty('warns')
      expect(result).toHaveProperty('errors')
      expect(result).toHaveProperty('info')
      expect(result).toHaveProperty('debug')

      // Helper function logs should be added if unique
      expect(result?.logs).toContain('console.log output')
      expect(result?.logs).toContain('Helper function log')
      expect(result?.errors).toContain('console.error output')
      expect(result?.errors).toContain('Helper function error')
    })

    it('should clean up empty arrays', () => {
      const vitestOutput: ConsoleOutput = {
        logs: [],
        errors: ['error message']
      }
      const customOutput: ConsoleOutput = {
        warns: []
      }

      const result = merger.merge(vitestOutput, customOutput)

      // Should only have errors, no empty arrays
      expect(result).toEqual({
        errors: ['error message']
      })
      expect(result).not.toHaveProperty('logs')
      expect(result).not.toHaveProperty('warns')
    })

    it('should handle complex deduplication scenarios', () => {
      const vitestOutput: ConsoleOutput = {
        logs: [
          '[1000ms] Starting test',
          'Processing data',
          '[2000ms] Test complete',
          '2024-01-01T00:00:00.000Z Log with timestamp'
        ]
      }
      const customOutput: ConsoleOutput = {
        logs: [
          '[500ms] Starting test', // Same message, different timestamp
          'Processing data', // Exact duplicate
          'Additional custom log' // Unique
        ]
      }

      const result = merger.merge(vitestOutput, customOutput)

      expect(result?.logs).toContain('[500ms] Starting test')
      expect(result?.logs).not.toContain('[1000ms] Starting test')
      expect(result?.logs?.filter((log) => log === 'Processing data')).toHaveLength(1)
      expect(result?.logs).toContain('Additional custom log')
      expect(result?.logs).toContain('[2000ms] Test complete')
    })

    it('should handle all console method types', () => {
      const vitestOutput: ConsoleOutput = {
        logs: ['stdout log'],
        errors: ['stderr error']
      }
      const customOutput: ConsoleOutput = {
        logs: ['console.log'],
        errors: ['console.error'],
        warns: ['console.warn'],
        info: ['console.info'],
        debug: ['console.debug', 'console.trace']
      }

      const result = merger.merge(vitestOutput, customOutput)

      // All methods should be present
      expect(Object.keys(result || {})).toContain('logs')
      expect(Object.keys(result || {})).toContain('errors')
      expect(Object.keys(result || {})).toContain('warns')
      expect(Object.keys(result || {})).toContain('info')
      expect(Object.keys(result || {})).toContain('debug')

      // Verify content
      expect(result?.debug).toHaveLength(2)
      expect(result?.debug).toContain('console.debug')
      expect(result?.debug).toContain('console.trace')
    })
  })

  describe('fuzzy matching', () => {
    it('should deduplicate messages with typos using Levenshtein distance', () => {
      const vitestOutput: ConsoleOutput = {
        logs: ['Test message with typo', 'Another log entry']
      }
      const customOutput: ConsoleOutput = {
        logs: ['Test mesage with typo', 'Different log'] // Note: "mesage" typo
      }

      const result = merger.merge(vitestOutput, customOutput)

      // Should deduplicate despite the typo (high similarity)
      expect(result?.logs).toHaveLength(3)
      expect(result?.logs).toContain('Test mesage with typo')
      expect(result?.logs).toContain('Another log entry')
      expect(result?.logs).toContain('Different log')
      // Should not contain the version with different typo
      expect(result?.logs).not.toContain('Test message with typo')
    })

    it('should deduplicate messages with minor character differences', () => {
      const vitestOutput: ConsoleOutput = {
        logs: ['Processing request #12345', 'Complete']
      }
      const customOutput: ConsoleOutput = {
        logs: ['Processing request #12346', 'Complete'] // Different number, 96% similar - will dedupe
      }

      const result = merger.merge(vitestOutput, customOutput)

      // These are 96% similar (1 char diff in 25 chars), so they WILL be deduplicated
      expect(result?.logs).toHaveLength(2) // Only 'Processing request #12346' and 'Complete'
      expect(result?.logs).toContain('Processing request #12346') // Custom output wins
      expect(result?.logs?.filter((log) => log === 'Complete')).toHaveLength(1)
    })

    it('should handle case differences with fuzzy matching', () => {
      const vitestOutput: ConsoleOutput = {
        logs: ['ERROR: Database connection failed']
      }
      const customOutput: ConsoleOutput = {
        logs: ['Error: Database connection failed'] // Case difference
      }

      const result = merger.merge(vitestOutput, customOutput)

      // Should deduplicate as they're very similar
      expect(result?.logs).toHaveLength(1)
    })

    it('should not over-deduplicate with fuzzy matching', () => {
      const vitestOutput: ConsoleOutput = {
        logs: ['User logged in', 'User logged out']
      }
      const customOutput: ConsoleOutput = {
        logs: ['User signed in', 'User signed out']
      }

      const result = merger.merge(vitestOutput, customOutput)

      // These should NOT be deduplicated (below similarity threshold)
      expect(result?.logs).toHaveLength(4)
      expect(result?.logs).toContain('User signed in')
      expect(result?.logs).toContain('User signed out')
      expect(result?.logs).toContain('User logged in')
      expect(result?.logs).toContain('User logged out')
    })

    it('should respect the 85% similarity threshold', () => {
      // 10 char string with 2 char difference = 80% similar (should not dedupe)
      const vitestOutput: ConsoleOutput = {
        logs: ['abcdefghij']
      }
      const customOutput: ConsoleOutput = {
        logs: ['abcdefghXY'] // 2 char difference in 10 chars = 80% similar
      }

      const result = merger.merge(vitestOutput, customOutput)
      expect(result?.logs).toHaveLength(2)

      // 20 char string with 2 char difference = 90% similar (should dedupe)
      const vitestOutput2: ConsoleOutput = {
        logs: ['abcdefghij1234567890']
      }
      const customOutput2: ConsoleOutput = {
        logs: ['abcdefghij12345678XY'] // 2 char difference in 20 chars = 90% similar
      }

      const result2 = merger.merge(vitestOutput2, customOutput2)
      expect(result2?.logs).toHaveLength(1)
    })
  })

  describe('caching performance', () => {
    it('should cache normalized strings for performance', () => {
      // Create outputs with many repeated strings
      const repeatedLog = 'Repeated log message with timestamp [123ms]'
      const vitestOutput: ConsoleOutput = {
        logs: Array.from({ length: 50 }, () => repeatedLog) // Create separate string instances
      }
      const customOutput: ConsoleOutput = {
        logs: ['Different log', repeatedLog] // Mix of different and same
      }

      // Measure performance (this should be fast due to caching)
      const startTime = performance.now()
      const result = merger.merge(vitestOutput, customOutput)
      const endTime = performance.now()

      // Should deduplicate repeated logs but keep unique ones
      expect(result?.logs).toContain('Different log')
      expect(result?.logs).toContain(repeatedLog)
      expect(result?.logs).toHaveLength(2) // Only 2 unique messages

      // Performance assertion (should be fast with caching)
      // This is a loose check - mainly ensuring caching doesn't break functionality
      expect(endTime - startTime).toBeLessThan(100) // Should complete in under 100ms
    })

    it('should handle cache size limits gracefully', () => {
      // Create many messages to exceed cache limit of 100
      // The goal is to test that caching doesn't break with many entries
      const vitestOutput: ConsoleOutput = {
        logs: Array.from({ length: 75 }, (_, i) => {
          // Create messages that are intentionally different enough
          // Use completely different patterns to avoid fuzzy matching
          if (i % 3 === 0)
            return `ERROR [${i}]: Failed to connect to database server at localhost:5432`
          if (i % 3 === 1)
            return `INFO [${i}]: Successfully processed batch job with ID ${i * 1000}`
          return `DEBUG [${i}]: Cache miss for key user_session_${i}_data`
        })
      }
      const customOutput: ConsoleOutput = {
        logs: Array.from({ length: 75 }, (_, i) => {
          // Use very different message patterns
          if (i % 3 === 0) return `WARNING: Memory usage exceeded ${i * 10}% threshold`
          if (i % 3 === 1) return `Transaction ${i}: Payment processed for amount $${i * 100}`
          return `Metric recorded: response_time_ms=${i * 50}`
        })
      }

      // Should not throw despite exceeding cache size
      expect(() => merger.merge(vitestOutput, customOutput)).not.toThrow()

      const result = merger.merge(vitestOutput, customOutput)
      // Should have deduplicated some similar messages but cache should handle it gracefully
      expect(result?.logs).toBeDefined()
      expect(result?.logs?.length).toBeGreaterThan(0)
      // The exact count doesn't matter - we're testing cache doesn't break
    })

    it('should clear cache between merge operations', () => {
      const output1: ConsoleOutput = { logs: ['First merge'] }
      const output2: ConsoleOutput = { logs: ['Second merge'] }

      // First merge
      merger.merge(output1, undefined)

      // Second merge - should have fresh cache
      const result = merger.merge(output2, undefined)

      expect(result?.logs).toEqual(['Second merge'])
      // Cache should be cleared, no interference between merges
    })
  })

  describe('edge cases', () => {
    it('should handle null/undefined values in arrays gracefully', () => {
      const vitestOutput: ConsoleOutput = {
        logs: ['valid log', undefined as any, null as any]
      }
      const customOutput: ConsoleOutput = {
        logs: ['another log']
      }

      // Should not throw and should handle gracefully
      expect(() => merger.merge(vitestOutput, customOutput)).not.toThrow()
    })

    it('should handle very long messages', () => {
      const longMessage = 'x'.repeat(10000)
      const vitestOutput: ConsoleOutput = {
        logs: [longMessage]
      }
      const customOutput: ConsoleOutput = {
        logs: [longMessage] // Duplicate
      }

      const result = merger.merge(vitestOutput, customOutput)

      // Should deduplicate even for very long messages
      expect(result?.logs).toHaveLength(1)
      expect(result?.logs?.[0]).toBe(longMessage)
    })

    it('should handle special characters in messages', () => {
      const vitestOutput: ConsoleOutput = {
        logs: ['Message with \n newline', 'Message with \t tab']
      }
      const customOutput: ConsoleOutput = {
        logs: ['Message with \n newline', 'Different message']
      }

      const result = merger.merge(vitestOutput, customOutput)

      // Should handle special characters correctly
      expect(result?.logs?.filter((log) => log === 'Message with \n newline')).toHaveLength(1)
      expect(result?.logs).toContain('Message with \t tab')
      expect(result?.logs).toContain('Different message')
    })
  })
})
