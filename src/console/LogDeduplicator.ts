/**
 * Log deduplication service implementation
 * Detects and consolidates duplicate log messages at the same level
 *
 * @module console/LogDeduplicator
 */

import type {
  ILogDeduplicator,
  LogEntry,
  DeduplicationEntry,
  DeduplicationStats,
  DeduplicationConfig
} from '../types/deduplication.js'

/**
 * Default configuration values
 */
const DEFAULTS: Required<DeduplicationConfig> = {
  enabled: false,
  maxCacheEntries: 10000,
  includeSources: false,
  normalizeWhitespace: true,
  stripTimestamps: true,
  stripAnsiCodes: true
}

/**
 * Log deduplicator implementation
 * Manages duplicate detection and consolidation across test runs
 */
export class LogDeduplicator implements ILogDeduplicator {
  private config: Required<DeduplicationConfig>
  private entries: Map<string, DeduplicationEntry>
  private stats: DeduplicationStats
  private startTime: number

  constructor(config: DeduplicationConfig) {
    this.config = { ...DEFAULTS, ...config }
    this.entries = new Map()
    this.stats = {
      totalLogs: 0,
      uniqueLogs: 0,
      duplicatesRemoved: 0,
      cacheSize: 0,
      processingTimeMs: 0
    }
    this.startTime = Date.now()
  }

  /**
   * Check if a log entry is a duplicate and update cache
   * @returns true if duplicate (should be suppressed), false if unique
   */
  isDuplicate(entry: LogEntry): boolean {
    // Always return false if disabled - do this BEFORE any processing
    if (!this.config.enabled) {
      return false
    }

    const processingStart = Date.now()

    this.stats.totalLogs++
    const key = this.generateKey(entry)

    // Check if we've seen this before
    const existing = this.entries.get(key)
    if (existing) {
      // Update existing entry
      existing.count++
      existing.lastSeen = entry.timestamp
      if (entry.testId && this.config.includeSources) {
        existing.sources.add(entry.testId)
      }
      this.stats.duplicatesRemoved++
      this.updateProcessingTime(processingStart)
      return true
    }

    // Check cache size limit
    if (this.entries.size >= this.config.maxCacheEntries) {
      this.evictOldest()
    }

    // Create new entry
    const newEntry: DeduplicationEntry = {
      key,
      logLevel: entry.level,
      originalMessage: entry.message,
      normalizedMessage: this.normalizeMessage(entry.message),
      firstSeen: entry.timestamp,
      lastSeen: entry.timestamp,
      count: 1,
      sources: new Set(entry.testId ? [entry.testId] : [])
    }

    this.entries.set(key, newEntry)
    this.stats.uniqueLogs++
    this.stats.cacheSize = this.entries.size
    this.updateProcessingTime(processingStart)
    return false
  }

  /**
   * Generate a deduplication key for a log entry
   */
  generateKey(entry: LogEntry): string {
    const normalized = this.normalizeMessage(entry.message)
    const hash = this.hashMessage(normalized)
    return `${entry.level}:${hash}`
  }

  /**
   * Get deduplication metadata for a log entry
   */
  getMetadata(key: string): DeduplicationEntry | undefined {
    return this.entries.get(key)
  }

  /**
   * Get all deduplicated entries
   */
  getAllEntries(): Map<string, DeduplicationEntry> {
    return new Map(this.entries)
  }

  /**
   * Get deduplication statistics
   */
  getStats(): DeduplicationStats {
    return {
      ...this.stats,
      processingTimeMs: Date.now() - this.startTime
    }
  }

  /**
   * Clear the deduplication cache
   */
  clear(): void {
    this.entries.clear()
    this.stats = {
      totalLogs: 0,
      uniqueLogs: 0,
      duplicatesRemoved: 0,
      cacheSize: 0,
      processingTimeMs: 0
    }
    this.startTime = Date.now()
  }

  /**
   * Check if deduplication is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled
  }

  /**
   * Normalize a message for comparison
   */
  private normalizeMessage(message: string): string {
    // Return early if no normalization needed
    if (
      !this.config.stripAnsiCodes &&
      !this.config.stripTimestamps &&
      !this.config.normalizeWhitespace
    ) {
      return message.toLowerCase()
    }

    let normalized = message

    // Strip ANSI color codes
    if (this.config.stripAnsiCodes && normalized.includes('\x1b')) {
      // eslint-disable-next-line no-control-regex
      normalized = normalized.replace(/\x1b\[[0-9;]*m/g, '')
    }

    // Strip timestamps (various formats)
    if (this.config.stripTimestamps) {
      // Only apply regex if likely to contain timestamps
      // ISO timestamps
      if (normalized.includes('T') || normalized.includes(':')) {
        normalized = normalized.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?/g, '')
        // Common date formats
        normalized = normalized.replace(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/g, '')
      }
      // Unix timestamps (10 or 13 digits)
      if (/\b\d{10,13}\b/.test(normalized)) {
        normalized = normalized.replace(/\b\d{10}(\d{3})?\b/g, '')
      }
    }

    // Normalize whitespace
    if (this.config.normalizeWhitespace && /\s{2,}/.test(normalized)) {
      normalized = normalized.replace(/\s+/g, ' ').trim()
    }

    return normalized.toLowerCase()
  }

  /**
   * Generate a hash for a normalized message
   */
  private hashMessage(message: string): string {
    // Use a simpler hash for better performance
    // DJB2 hash algorithm - much faster than SHA256 for our use case
    let hash = 5381
    for (let i = 0; i < message.length; i++) {
      hash = (hash << 5) + hash + message.charCodeAt(i)
      hash = hash & 0xffffffff // Convert to 32bit integer
    }
    return hash.toString(36) // Convert to base36 for shorter string
  }

  /**
   * Evict the oldest entry when cache is full (LRU)
   */
  private evictOldest(): void {
    // Find the entry with oldest lastSeen
    let oldestKey: string | null = null
    let oldestTime: Date | null = null

    for (const [key, entry] of this.entries) {
      if (!oldestTime || entry.lastSeen < oldestTime) {
        oldestTime = entry.lastSeen
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.entries.delete(oldestKey)
      this.stats.cacheSize = this.entries.size
    }
  }

  /**
   * Update processing time statistics
   */
  private updateProcessingTime(startTime: number): void {
    const elapsed = Date.now() - startTime
    this.stats.processingTimeMs += elapsed
  }
}
