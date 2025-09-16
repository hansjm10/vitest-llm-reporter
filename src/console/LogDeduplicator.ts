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
import { DEFAULT_DEDUPLICATION_CONFIG } from '../config/deduplication-config.js'
import { normalizeMessage, hashMessage } from '../utils/message-normalizer.js'

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
    this.config = { ...DEFAULT_DEDUPLICATION_CONFIG, ...config } as Required<DeduplicationConfig>
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
      // Move to end of Map (most recently used) - O(1) operation
      this.entries.delete(key)
      this.entries.set(key, existing)
      this.stats.duplicatesRemoved++
      this.updateProcessingTime(processingStart)
      return true
    }

    // Check cache size limit
    if (this.entries.size >= this.config.maxCacheEntries) {
      this.evictOldest()
    }

    // Create new entry
    const sources = this.config.includeSources && entry.testId ? new Set([entry.testId]) : new Set<string>()

    const newEntry: DeduplicationEntry = {
      key,
      logLevel: entry.level,
      originalMessage: entry.message,
      firstSeen: entry.timestamp,
      lastSeen: entry.timestamp,
      count: 1,
      sources
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
    const normalized = normalizeMessage(entry.message, this.config)
    const hash = hashMessage(normalized)
    return `${entry.level}:${hash}`
  }

  /**
   * Get deduplication metadata for a log entry
   */
  getMetadata(key: string): DeduplicationEntry | undefined {
    return this.entries.get(key)
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
   * Evict the oldest entry when cache is full (LRU)
   */
  private evictOldest(): void {
    // O(1) eviction - Map maintains insertion order, first entry is oldest
    const firstKey = this.entries.keys().next().value
    if (firstKey !== undefined) {
      this.entries.delete(firstKey)
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
