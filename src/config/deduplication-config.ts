/**
 * Deduplication configuration extensions for the LLM Reporter
 *
 * @module config/deduplication-config
 */

import type { LLMReporterConfig } from '../types/reporter.js'
import type { DeduplicationConfig } from '../types/deduplication.js'

/**
 * Extended LLM Reporter configuration with deduplication support
 */
export interface LLMReporterConfigWithDeduplication extends LLMReporterConfig {
  /**
   * Log deduplication settings
   * Can be a boolean to enable/disable with defaults, or a detailed config object
   */
  deduplicateLogs?: boolean | DeduplicationConfig
}

/**
 * Default deduplication configuration values
 */
export const DEFAULT_DEDUPLICATION_CONFIG: DeduplicationConfig = {
  enabled: true,
  maxCacheEntries: 10000,
  includeSources: false,
  normalizeWhitespace: true,
  stripTimestamps: true,
  stripAnsiCodes: true,
  scope: 'global'
}

/**
 * Normalize deduplication configuration
 * Converts boolean or partial config to full DeduplicationConfig
 */
export function normalizeDeduplicationConfig(
  config?: boolean | DeduplicationConfig
): DeduplicationConfig {
  // Default to enabled when undefined
  if (config === undefined) {
    return { ...DEFAULT_DEDUPLICATION_CONFIG }
  }

  // Explicitly disabled
  if (config === false) {
    return { ...DEFAULT_DEDUPLICATION_CONFIG, enabled: false }
  }

  // Explicitly enabled
  if (config === true) {
    return { ...DEFAULT_DEDUPLICATION_CONFIG, enabled: true }
  }

  // Config object - use defaults with overrides
  return {
    ...DEFAULT_DEDUPLICATION_CONFIG,
    ...config
  }
}

/**
 * Validate deduplication configuration
 * @throws Error if configuration is invalid
 */
export function validateDeduplicationConfig(config: DeduplicationConfig): void {
  if (config.maxCacheEntries !== undefined) {
    if (typeof config.maxCacheEntries !== 'number' || config.maxCacheEntries <= 0) {
      throw new Error('maxCacheEntries must be a positive number')
    }
    if (config.maxCacheEntries > 100000) {
      throw new Error('maxCacheEntries exceeds maximum limit of 100000')
    }
  }

  const booleanFields: (keyof DeduplicationConfig)[] = [
    'enabled',
    'includeSources',
    'normalizeWhitespace',
    'stripTimestamps',
    'stripAnsiCodes'
  ]

  for (const field of booleanFields) {
    if (config[field] !== undefined && typeof config[field] !== 'boolean') {
      throw new Error(`${field} must be a boolean`)
    }
  }

  if (config.scope !== undefined && config.scope !== 'global' && config.scope !== 'per-test') {
    throw new Error('scope must be "global" or "per-test"')
  }
}
