import { describe, it, expect } from 'vitest'
import { ConsoleMerger } from './merge.js'
import type { ConsoleOutput } from '../types/schema.js'

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
