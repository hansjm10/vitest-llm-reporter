/**
 * Deduplication types for the reporter
 *
 * @module types/deduplication
 */

import type { ConsoleMethod } from './console'

/**
 * Log level type matching console methods
 */
export type LogLevel = ConsoleMethod

/**
 * Configuration for log deduplication feature
 */
export interface DeduplicationConfig {
  /**
   * Enable or disable log deduplication
   * @default false
   */
  enabled?: boolean

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
 * Represents a unique log entry with tracking metadata
 */
export interface DeduplicationEntry {
  /** Composite key (logLevel:normalizedMessage) */
  key: string

  /** The severity level */
  logLevel: LogLevel

  /** First occurrence of the message */
  originalMessage: string

  /** Message after normalization */
  normalizedMessage: string

  /** Timestamp of first occurrence */
  firstSeen: Date

  /** Timestamp of most recent occurrence */
  lastSeen: Date

  /** Total occurrences */
  count: number

  /** Test IDs that generated this log */
  sources: Set<string>

  /** Additional context (optional) */
  metadata?: Map<string, unknown>
}

/**
 * Performance and usage metrics for deduplication
 */
export interface DeduplicationStats {
  /** All logs processed */
  totalLogs: number

  /** Unique entries created */
  uniqueLogs: number

  /** Logs deduplicated */
  duplicatesRemoved: number

  /** Current entry count */
  cacheSize: number

  /** Total processing time in milliseconds */
  processingTimeMs: number
}

/**
 * Log entry for deduplication processing
 */
export interface LogEntry {
  message: string
  level: LogLevel
  timestamp: Date
  testId?: string
}

/**
 * Deduplication metadata in output
 */
export interface DeduplicationMetadata {
  /** Number of times this log appeared */
  count: number

  /** ISO timestamp of first occurrence */
  firstSeen: string

  /** ISO timestamp of last occurrence */
  lastSeen?: string

  /** Test IDs that generated this log (if configured) */
  sources?: string[]

  /** Flag indicating this entry was deduplicated */
  deduplicated: boolean
}

/**
 * Console output with deduplication metadata
 */
export interface ConsoleOutputWithDeduplication {
  /** The log message content */
  message: string

  /** Log severity level */
  level: string

  /** Standard timestamp */
  timestamp: string

  /** Deduplication metadata (if applicable) */
  deduplication?: DeduplicationMetadata
}

/**
 * Deduplication service interface
 */
export interface ILogDeduplicator {
  /**
   * Check if a log entry is a duplicate and update cache
   * @returns true if duplicate (should be suppressed), false if unique
   */
  isDuplicate(entry: LogEntry): boolean

  /**
   * Get deduplication metadata for a log entry
   */
  getMetadata(key: string): DeduplicationEntry | undefined

  /**
   * Get all deduplicated entries
   */
  getAllEntries(): Map<string, DeduplicationEntry>

  /**
   * Get deduplication statistics
   */
  getStats(): DeduplicationStats

  /**
   * Clear the deduplication cache
   */
  clear(): void

  /**
   * Check if deduplication is enabled
   */
  isEnabled(): boolean

  /**
   * Generate a deduplication key for a log entry
   */
  generateKey(entry: LogEntry): string
}
