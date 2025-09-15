/**
 * Contract: Log Deduplication Configuration
 * Defines the configuration interface for the log deduplication feature
 */

export interface DeduplicationConfig {
  /**
   * Enable or disable log deduplication
   * @default false
   */
  enabled: boolean

  /**
   * Maximum number of unique entries to cache
   * @default 10000
   */
  maxCacheEntries?: number

  /**
   * Include source test IDs in deduplication metadata
   * @default false
   */
  includeSources?: boolean

  /**
   * Normalize whitespace when comparing messages
   * @default true
   */
  normalizeWhitespace?: boolean

  /**
   * Strip timestamp patterns when comparing messages
   * @default true
   */
  stripTimestamps?: boolean

  /**
   * Strip ANSI color codes when comparing messages
   * @default true
   */
  stripAnsiCodes?: boolean
}

/**
 * Extended LLM Reporter configuration with deduplication
 */
export interface LLMReporterConfigWithDeduplication {
  /**
   * Log deduplication settings
   */
  deduplicateLogs?: boolean | DeduplicationConfig

  // Existing configuration fields preserved...
  verbose?: boolean
  outputFile?: string
  enableConsoleOutput?: boolean
  includePassedTests?: boolean
  includeSkippedTests?: boolean
  captureConsoleOnFailure?: boolean
  maxConsoleBytes?: number
  maxConsoleLines?: number
  includeDebugOutput?: boolean
}
