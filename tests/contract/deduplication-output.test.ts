/**
 * Contract test for output format with deduplication metadata
 * Tests the output structure when deduplication is enabled
 * 
 * These tests MUST FAIL initially (TDD Red phase)
 */

import { describe, it, expect } from 'vitest'
import type { 
  DeduplicationMetadata,
  ConsoleOutputWithDeduplication,
} from '../../src/types/deduplication.js'
import { assertHasDeduplicationMetadata } from '../utils/deduplication-helpers.js'

// This import will fail initially - OutputBuilder extensions don't exist yet
// @ts-expect-error - Implementation doesn't exist yet (TDD)
import { formatConsoleOutputWithDeduplication } from '../../src/output/deduplication-formatter.js'

describe('Deduplication Output Format Contract', () => {
  describe('DeduplicationMetadata structure', () => {
    it('should include count field', () => {
      const metadata: DeduplicationMetadata = {
        count: 5,
        firstSeen: '2024-01-01T10:00:00.000Z',
        deduplicated: true,
      }
      expect(metadata.count).toBe(5)
      expect(metadata.deduplicated).toBe(true)
    })

    it('should include firstSeen timestamp', () => {
      const metadata: DeduplicationMetadata = {
        count: 2,
        firstSeen: '2024-01-01T10:00:00.000Z',
        lastSeen: '2024-01-01T10:05:00.000Z',
        deduplicated: true,
      }
      expect(metadata.firstSeen).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      expect(metadata.lastSeen).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('should optionally include sources array', () => {
      const metadata: DeduplicationMetadata = {
        count: 3,
        firstSeen: '2024-01-01T10:00:00.000Z',
        sources: ['test-1', 'test-2', 'test-3'],
        deduplicated: true,
      }
      expect(metadata.sources).toHaveLength(3)
      expect(metadata.sources).toContain('test-1')
      expect(metadata.sources).toContain('test-2')
      expect(metadata.sources).toContain('test-3')
    })

    it('should have deduplicated flag', () => {
      const deduplicatedMetadata: DeduplicationMetadata = {
        count: 5,
        firstSeen: '2024-01-01T10:00:00.000Z',
        deduplicated: true,
      }
      const uniqueMetadata: DeduplicationMetadata = {
        count: 1,
        firstSeen: '2024-01-01T10:00:00.000Z',
        deduplicated: false,
      }
      
      expect(deduplicatedMetadata.deduplicated).toBe(true)
      expect(uniqueMetadata.deduplicated).toBe(false)
    })
  })

  describe('ConsoleOutputWithDeduplication structure', () => {
    it('should include standard console fields', () => {
      const output: ConsoleOutputWithDeduplication = {
        message: 'Test log message',
        level: 'info',
        timestamp: '2024-01-01T10:00:00.000Z',
      }
      
      expect(output.message).toBe('Test log message')
      expect(output.level).toBe('info')
      expect(output.timestamp).toBeDefined()
    })

    it('should optionally include deduplication metadata', () => {
      const outputWithDedup: ConsoleOutputWithDeduplication = {
        message: 'Duplicate message',
        level: 'warn',
        timestamp: '2024-01-01T10:00:00.000Z',
        deduplication: {
          count: 3,
          firstSeen: '2024-01-01T09:55:00.000Z',
          lastSeen: '2024-01-01T10:00:00.000Z',
          deduplicated: true,
        },
      }
      
      expect(outputWithDedup.deduplication).toBeDefined()
      expect(outputWithDedup.deduplication?.count).toBe(3)
      expect(outputWithDedup.deduplication?.deduplicated).toBe(true)
    })

    it('should not include deduplication for unique messages', () => {
      const uniqueOutput: ConsoleOutputWithDeduplication = {
        message: 'Unique message',
        level: 'info',
        timestamp: '2024-01-01T10:00:00.000Z',
      }
      
      expect(uniqueOutput.deduplication).toBeUndefined()
    })
  })

  describe('formatConsoleOutputWithDeduplication', () => {
    it('should format unique message without deduplication metadata', () => {
      const input = {
        message: 'Unique log message',
        level: 'info',
        timestamp: new Date('2024-01-01T10:00:00.000Z'),
      }
      
      // @ts-expect-error - Function doesn't exist yet (TDD)
      const output = formatConsoleOutputWithDeduplication(input, false)
      
      expect(output.message).toBe('Unique log message')
      expect(output.level).toBe('info')
      expect(output.deduplication).toBeUndefined()
    })

    it('should add deduplication metadata for duplicates', () => {
      const input = {
        message: 'Duplicate message',
        level: 'warn',
        timestamp: new Date('2024-01-01T10:00:00.000Z'),
      }
      
      const deduplicationInfo = {
        count: 5,
        firstSeen: new Date('2024-01-01T09:50:00.000Z'),
        lastSeen: new Date('2024-01-01T10:00:00.000Z'),
        sources: new Set(['test-1', 'test-2', 'test-3']),
      }
      
      // @ts-expect-error - Function doesn't exist yet (TDD)
      const output = formatConsoleOutputWithDeduplication(input, true, deduplicationInfo, { includeSources: true })

      expect(output.deduplication).toBeDefined()
      expect(output.deduplication?.count).toBe(5)
      expect(output.deduplication?.deduplicated).toBe(true)
      expect(output.deduplication?.sources).toHaveLength(3)
    })

    it('should format timestamps as ISO strings', () => {
      const input = {
        message: 'Test message',
        level: 'error',
        timestamp: new Date('2024-01-01T10:30:45.123Z'),
      }
      
      const deduplicationInfo = {
        count: 2,
        firstSeen: new Date('2024-01-01T10:25:00.000Z'),
        lastSeen: new Date('2024-01-01T10:30:45.123Z'),
        sources: new Set(['test-1']),
      }
      
      // @ts-expect-error - Function doesn't exist yet (TDD)
      const output = formatConsoleOutputWithDeduplication(input, true, deduplicationInfo)
      
      expect(output.timestamp).toBe('2024-01-01T10:30:45.123Z')
      expect(output.deduplication?.firstSeen).toBe('2024-01-01T10:25:00.000Z')
      expect(output.deduplication?.lastSeen).toBe('2024-01-01T10:30:45.123Z')
    })

    it('should convert Set to Array for sources', () => {
      const input = {
        message: 'Test',
        level: 'debug',
        timestamp: new Date(),
      }
      
      const deduplicationInfo = {
        count: 3,
        firstSeen: new Date(),
        lastSeen: new Date(),
        sources: new Set(['test-a', 'test-b', 'test-c']),
      }
      
      // @ts-expect-error - Function doesn't exist yet (TDD)
      const output = formatConsoleOutputWithDeduplication(input, true, deduplicationInfo, { includeSources: true })

      expect(Array.isArray(output.deduplication?.sources)).toBe(true)
      expect(output.deduplication?.sources).toContain('test-a')
      expect(output.deduplication?.sources).toContain('test-b')
      expect(output.deduplication?.sources).toContain('test-c')
    })

    it('should exclude sources when not configured', () => {
      const input = {
        message: 'Test',
        level: 'info',
        timestamp: new Date(),
      }
      
      const deduplicationInfo = {
        count: 2,
        firstSeen: new Date(),
        lastSeen: new Date(),
        sources: new Set(['test-1', 'test-2']),
      }
      
      // @ts-expect-error - Function doesn't exist yet (TDD)
      const output = formatConsoleOutputWithDeduplication(
        input, 
        true, 
        deduplicationInfo,
        { includeSources: false }
      )
      
      expect(output.deduplication?.sources).toBeUndefined()
      expect(output.deduplication?.count).toBe(2)
    })
  })

  describe('Output validation helpers', () => {
    it('should validate deduplication metadata presence', () => {
      const output: ConsoleOutputWithDeduplication = {
        message: 'Test',
        level: 'info',
        timestamp: '2024-01-01T10:00:00.000Z',
        deduplication: {
          count: 3,
          firstSeen: '2024-01-01T09:55:00.000Z',
          deduplicated: true,
          sources: ['test-1', 'test-2'],
        },
      }
      
      // Should not throw
      expect(() => assertHasDeduplicationMetadata(output, 3, ['test-1', 'test-2']))
        .not.toThrow()
    })

    it('should throw when metadata is missing', () => {
      const output: ConsoleOutputWithDeduplication = {
        message: 'Test',
        level: 'info',
        timestamp: '2024-01-01T10:00:00.000Z',
      }
      
      expect(() => assertHasDeduplicationMetadata(output, 1))
        .toThrow('Expected deduplication metadata but found none')
    })

    it('should throw when count mismatch', () => {
      const output: ConsoleOutputWithDeduplication = {
        message: 'Test',
        level: 'info',
        timestamp: '2024-01-01T10:00:00.000Z',
        deduplication: {
          count: 2,
          firstSeen: '2024-01-01T09:55:00.000Z',
          deduplicated: true,
        },
      }
      
      expect(() => assertHasDeduplicationMetadata(output, 5))
        .toThrow('Expected count 5 but got 2')
    })

    it('should throw when sources mismatch', () => {
      const output: ConsoleOutputWithDeduplication = {
        message: 'Test',
        level: 'info',
        timestamp: '2024-01-01T10:00:00.000Z',
        deduplication: {
          count: 2,
          firstSeen: '2024-01-01T09:55:00.000Z',
          deduplicated: true,
          sources: ['test-1'],
        },
      }
      
      expect(() => assertHasDeduplicationMetadata(output, 2, ['test-1', 'test-2']))
        .toThrow('Expected 2 sources but got 1')
    })
  })

  describe('JSON serialization', () => {
    it('should serialize to valid JSON', () => {
      const output: ConsoleOutputWithDeduplication = {
        message: 'Test message',
        level: 'warn',
        timestamp: '2024-01-01T10:00:00.000Z',
        deduplication: {
          count: 3,
          firstSeen: '2024-01-01T09:55:00.000Z',
          lastSeen: '2024-01-01T10:00:00.000Z',
          sources: ['test-1', 'test-2'],
          deduplicated: true,
        },
      }
      
      const json = JSON.stringify(output)
      const parsed = JSON.parse(json)
      
      expect(parsed.message).toBe('Test message')
      expect(parsed.deduplication.count).toBe(3)
      expect(parsed.deduplication.sources).toHaveLength(2)
      expect(parsed.deduplication.deduplicated).toBe(true)
    })

    it('should maintain backward compatibility when deduplication is undefined', () => {
      const output: ConsoleOutputWithDeduplication = {
        message: 'Regular log',
        level: 'info',
        timestamp: '2024-01-01T10:00:00.000Z',
      }
      
      const json = JSON.stringify(output)
      expect(json).not.toContain('deduplication')
      
      const parsed = JSON.parse(json)
      expect(parsed.deduplication).toBeUndefined()
    })
  })
})