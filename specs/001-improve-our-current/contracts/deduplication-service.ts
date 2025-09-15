/**
 * Contract: Log Deduplication Service
 * Defines the service interface for log deduplication operations
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'log' | 'trace'

export interface LogEntry {
  message: string
  level: LogLevel
  timestamp: Date
  testId?: string
}

export interface DeduplicationEntry {
  key: string
  logLevel: LogLevel
  originalMessage: string
  normalizedMessage: string
  firstSeen: Date
  lastSeen: Date
  count: number
  sources: Set<string>
  metadata?: Map<string, unknown>
}

export interface DeduplicationStats {
  totalLogs: number
  uniqueLogs: number
  duplicatesRemoved: number
  cacheSize: number
  processingTimeMs: number
}

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
