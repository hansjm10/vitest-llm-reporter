/**
 * Contract test for deduplication configuration
 * Tests the configuration interface and validation
 *
 * These tests MUST FAIL initially (TDD Red phase)
 */

import { describe, it, expect } from 'vitest'
import {
  normalizeDeduplicationConfig,
  validateDeduplicationConfig,
  DEFAULT_DEDUPLICATION_CONFIG,
  type LLMReporterConfigWithDeduplication
} from '../../src/config/deduplication-config.js'
import type { DeduplicationConfig } from '../../src/types/deduplication.js'

describe('Deduplication Configuration Contract', () => {
  describe('normalizeDeduplicationConfig', () => {
    it('should return enabled config when undefined', () => {
      const result = normalizeDeduplicationConfig(undefined)
      expect(result.enabled).toBe(true)
      expect(result.maxCacheEntries).toBe(10000)
      expect(result.includeSources).toBe(false)
      expect(result.normalizeWhitespace).toBe(true)
      expect(result.stripTimestamps).toBe(true)
      expect(result.stripAnsiCodes).toBe(true)
      expect(result.scope).toBe('global')
    })

    it('should return disabled config when false', () => {
      const result = normalizeDeduplicationConfig(false)
      expect(result.enabled).toBe(false)
      expect(result).toMatchObject({ ...DEFAULT_DEDUPLICATION_CONFIG, enabled: false })
    })

    it('should return enabled config with defaults when true', () => {
      const result = normalizeDeduplicationConfig(true)
      expect(result.enabled).toBe(true)
      expect(result.maxCacheEntries).toBe(10000)
      expect(result.includeSources).toBe(false)
      expect(result.normalizeWhitespace).toBe(true)
      expect(result.stripTimestamps).toBe(true)
      expect(result.stripAnsiCodes).toBe(true)
      expect(result.scope).toBe('global')
    })

    it('should merge partial config with defaults', () => {
      const partial: DeduplicationConfig = {
        enabled: true,
        maxCacheEntries: 5000,
        includeSources: true
      }
      const result = normalizeDeduplicationConfig(partial)
      expect(result.enabled).toBe(true)
      expect(result.maxCacheEntries).toBe(5000)
      expect(result.includeSources).toBe(true)
      expect(result.normalizeWhitespace).toBe(true) // default
      expect(result.stripTimestamps).toBe(true) // default
      expect(result.stripAnsiCodes).toBe(true) // default
      expect(result.scope).toBe('global') // default
    })

    it('should override all defaults when full config provided', () => {
      const full: DeduplicationConfig = {
        enabled: true,
        maxCacheEntries: 20000,
        includeSources: true,
        normalizeWhitespace: false,
        stripTimestamps: false,
        stripAnsiCodes: false,
        scope: 'per-test'
      }
      const result = normalizeDeduplicationConfig(full)
      expect(result).toEqual(full)
    })
  })

  describe('validateDeduplicationConfig', () => {
    it('should accept valid configuration', () => {
      const validConfig: DeduplicationConfig = {
        enabled: true,
        maxCacheEntries: 5000,
        includeSources: true,
        normalizeWhitespace: true,
        stripTimestamps: true,
        stripAnsiCodes: true,
        scope: 'per-test'
      }
      expect(() => validateDeduplicationConfig(validConfig)).not.toThrow()
    })

    it('should reject negative maxCacheEntries', () => {
      const invalidConfig: DeduplicationConfig = {
        enabled: true,
        maxCacheEntries: -100
      }
      expect(() => validateDeduplicationConfig(invalidConfig)).toThrow(
        'maxCacheEntries must be a positive number'
      )
    })

    it('should reject zero maxCacheEntries', () => {
      const invalidConfig: DeduplicationConfig = {
        enabled: true,
        maxCacheEntries: 0
      }
      expect(() => validateDeduplicationConfig(invalidConfig)).toThrow(
        'maxCacheEntries must be a positive number'
      )
    })

    it('should reject maxCacheEntries over 100000', () => {
      const invalidConfig: DeduplicationConfig = {
        enabled: true,
        maxCacheEntries: 100001
      }
      expect(() => validateDeduplicationConfig(invalidConfig)).toThrow(
        'maxCacheEntries exceeds maximum limit of 100000'
      )
    })

    it('should reject non-boolean enabled field', () => {
      const invalidConfig = {
        enabled: 'yes', // invalid type
        maxCacheEntries: 1000
      } as any
      expect(() => validateDeduplicationConfig(invalidConfig)).toThrow('enabled must be a boolean')
    })

    it('should reject non-boolean includeSources field', () => {
      const invalidConfig = {
        enabled: true,
        includeSources: 1 // invalid type
      } as any
      expect(() => validateDeduplicationConfig(invalidConfig)).toThrow(
        'includeSources must be a boolean'
      )
    })

    it('should reject non-number maxCacheEntries', () => {
      const invalidConfig = {
        enabled: true,
        maxCacheEntries: '10000' // invalid type
      } as any
      expect(() => validateDeduplicationConfig(invalidConfig)).toThrow(
        'maxCacheEntries must be a positive number'
      )
    })

    it('should reject invalid scope values', () => {
      const invalidConfig = {
        enabled: true,
        scope: 'invalid'
      } as any
      expect(() => validateDeduplicationConfig(invalidConfig)).toThrow(
        'scope must be "global" or "per-test"'
      )
    })
  })

  describe('LLMReporterConfigWithDeduplication interface', () => {
    it('should extend LLMReporterConfig with deduplicateLogs option', () => {
      const config: LLMReporterConfigWithDeduplication = {
        verbose: true,
        outputFile: 'test.json',
        deduplicateLogs: true
      }
      expect(config.deduplicateLogs).toBe(true)
      expect(config.verbose).toBe(true)
      expect(config.outputFile).toBe('test.json')
    })

    it('should accept boolean deduplicateLogs', () => {
      const config1: LLMReporterConfigWithDeduplication = {
        deduplicateLogs: true
      }
      const config2: LLMReporterConfigWithDeduplication = {
        deduplicateLogs: false
      }
      expect(config1.deduplicateLogs).toBe(true)
      expect(config2.deduplicateLogs).toBe(false)
    })

    it('should accept DeduplicationConfig object', () => {
      const config: LLMReporterConfigWithDeduplication = {
        deduplicateLogs: {
          enabled: true,
          maxCacheEntries: 5000,
          includeSources: true,
          normalizeWhitespace: false,
          stripTimestamps: false,
          stripAnsiCodes: false,
          scope: 'per-test'
        }
      }
      expect(config.deduplicateLogs).toMatchObject({
        enabled: true,
        maxCacheEntries: 5000
      })
    })

    it('should be optional', () => {
      const config: LLMReporterConfigWithDeduplication = {
        verbose: true
        // deduplicateLogs not provided
      }
      expect(config.deduplicateLogs).toBeUndefined()
    })
  })

  describe('DEFAULT_DEDUPLICATION_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_DEDUPLICATION_CONFIG).toEqual({
        enabled: true,
        maxCacheEntries: 10000,
        includeSources: false,
        normalizeWhitespace: true,
        stripTimestamps: true,
        stripAnsiCodes: true,
        scope: 'global'
      })
    })

    it('should be enabled by default', () => {
      expect(DEFAULT_DEDUPLICATION_CONFIG.enabled).toBe(true)
    })

    it('should have reasonable cache limit', () => {
      expect(DEFAULT_DEDUPLICATION_CONFIG.maxCacheEntries).toBeGreaterThan(1000)
      expect(DEFAULT_DEDUPLICATION_CONFIG.maxCacheEntries).toBeLessThanOrEqual(100000)
    })
  })
})
